
const { constants, proofs } = require("@aztec/dev-utils");
const { secp256k1, note, proof, abiEncoder } = require("aztec.js");

const lineBreak = "________________________________________________________________________\n";

var ace = '0x36228733d23C60C9bB519576E785ed98035F47e2';
var joinSplit = '0x7CeCc44a21a93825F3A74970a1ff11A195CCc30D';
var zkAssetMintable = '0x118889Bdb7538a439CE9dAF471FeB53D43dd4eeA';
var zkAsset = '0xf74A09c971A8A58258D53d45feD796AC4C48A01C';
var erc20 = '0x296C847eB5dab834563c40dadbB5F503A0ce39f9';

async function instantiate(pantheon, txOptions, deploy) {
	var instances = {};

	console.log(lineBreak);
	console.log("init - AZTEC contracts...")

	// get contracts schemas
	const ACE = await pantheon.readContract("ACE.json");
	const ZKASSET_MINTABLE = await pantheon.readContract("ZkAssetMintable.json");
	const JOINSPLIT = await pantheon.readContract("JoinSplit.json");
	//const ADJUST_SUPPLY       = await pantheon.readContract("AdjustSupply.json");
	const ERC20_MINTABLE = await pantheon.readContract("ERC20Mintable.json");
	//const ZKASSET = await pantheon.readContract("ZkAsset.json");
	
	if (deploy) {
		// deploy crypto engine contract
		instances.ace = (await ACE.new(txOptions));
		instances.joinSplit = (await JOINSPLIT.new(txOptions));
		//instances.adjustSupply    = await ADJUST_SUPPLY.new(txOptions);
		instances.erc20 = (await ERC20_MINTABLE.new(txOptions));
		instances.zkAssetMintable = (await ZKASSET_MINTABLE.new(
			instances.ace.address,
			"0x0000000000000000000000000000000000000000", 	// ERC20 linked address (none)
			1, 												// scaling factor for ERC20 tokens
			true, 											// canMint
			false,  										// canConvert
			txOptions
		));

		instances.zkAsset = (await ZKASSET.new(
			instances.ace.address,
			instances.erc20.address, 						// ERC20 linked address
			1, 												// scaling factor for ERC20 tokens
			false, 											// canMint
			true,  											// canConvert
			txOptions
		));

		// set CRS and proof systems addresses

		await instances.ace.setCommonReferenceString(constants.CRS, txOptions);
		await instances.ace.setProof(proofs.JOIN_SPLIT_PROOF, instances.joinSplit.address, txOptions);
		//await instances.ace.setProof(proofs.MINT_PROOF, instances.adjustSupply.address, txOptions);
	}
	else {
		instances.ace = await ACE.at(ace);
		instances.joinSplit = await JOINSPLIT.at(joinSplit);
		instances.erc20 = await ERC20_MINTABLE.at(erc20);
		instances.zkAssetMintable = await ZKASSET_MINTABLE.at(zkAssetMintable);
		//instances.zkAsset = await ZKASSET.at(zkAsset);
	}

	console.log(" ace at:             " + instances.ace.address);
	console.log(" joinSplit at:       " + instances.joinSplit.address);
	//console.log("deployed adjustSupply at:    " + instances.adjustSupply.address);
	console.log(" zkAssetMintable at: " + instances.zkAssetMintable.address);
	//console.log(" zkAsset at:         " + instances.zkAsset.address);
	console.log(" erc20 at:           " + instances.erc20.address);
	console.log(lineBreak);

	return instances;
};

async function ZKAssetContractRef(pantheon, privateKeyIndex = 0){
	const ZKASSET = await pantheon.readContract("ZkAsset.json", privateKeyIndex); 
	return await ZKASSET.at(zkAsset);
}

// -------------------------------------------------------------------------------------------------
// Confidential transfer. Destroy inputNotes, creates outputNotes through a joinSplit transaction
async function confidentialTransfer(inputNotes, inputNoteOwners, outputNotes, zkAssetMintable, joinSplit, publicOwner, txOptions, display = true) {
	// compute kPublic
	var kPublic = 0;
	for (i = 0; i < outputNotes.length; i++) {
		kPublic -= outputNotes[i].k.toNumber();
	}
	for (i = 0; i < inputNotes.length; i++) {
		kPublic += inputNotes[i].k.toNumber();
	}

	// construct the joinsplit proof
	var {
		proofData
	} = proof.joinSplit.encodeJoinSplitTransaction({
		inputNotes: inputNotes,
		outputNotes: outputNotes,
		senderAddress: txOptions.from,
		inputNoteOwners: inputNoteOwners,
		publicOwner: publicOwner,
		kPublic: kPublic,
		validatorAddress: joinSplit.address
	});

	// send the transaction to the blockchain
	try {
		let receipt = await zkAssetMintable.confidentialTransfer(proofData, txOptions)
		if (display == true) {
			console.log("confidentialTransfer success. events:");
			logNoteEvents(receipt.logs);
			console.log(lineBreak);
		}

	} catch (error) {
		console.log("confidentialTransfer failed: " + error);
		process.exit(-1);
	}
}

// -------------------------------------------------------------------------------------------------
// Convert some ERC20 to zkassets
async function shieldsERC20toZkAsset(inputNotes, inputNoteOwner, outputNotes, zkAsset, ace, joinSplit, publicOwner, txOptions) {
	// compute kPublic
	var kPublic = 0;
	for (i = 0; i < outputNotes.length; i++) {
		kPublic -= outputNotes[i].k.toNumber();
	}
	for (i = 0; i < inputNotes.length; i++) {
		kPublic += inputNotes[i].k.toNumber();
	}

	// construct the joinsplit proof
	var proofData = proof.joinSplit.encodeJoinSplitTransaction({
		inputNotes: [],
		outputNotes: outputNotes,
		senderAddress: txOptions.from,
		inputNoteOwners: inputNoteOwner,
		publicOwner: publicOwner,
		kPublic: kPublic,
		validatorAddress: joinSplit.address
	});

	const depositProofOutput = abiEncoder.outputCoder.getProofOutput(proofData.expectedOutput, 0);
	const depositProofHash = abiEncoder.outputCoder.hashProofOutput(depositProofOutput);

	// 2. ace allows depositProofHash to spend erc20 tokens on behalf ethereumAccounts[0]
	await ace.publicApprove(
		zkAsset.address,
		depositProofHash,
		kPublic,
		txOptions
	)

	try {
		let receipt = await zkAsset.confidentialTransfer(proofData.proofData, txOptions);
	} catch (error) {
		console.log("deposit failed: " + error);
		process.exit(-1);
	}

}

// utility function to display Create and Destroy note event generated by ZkAsset.sol
function logNoteEvents(logs) {
	for (i = 0; i < logs.length; i++) {
		var e = logs[i];
		var toPrint = { event: e.event };
		if (e.event === "CreateNote" || e.event === "DestroyNote") {
			toPrint.owner = e.args.owner;
			toPrint.hash = e.args.noteHash;
			console.log(JSON.stringify(toPrint, null, 2));
		}
	}
}

module.exports = {
	instantiate,
	confidentialTransfer,
	shieldsERC20toZkAsset,
	secp256k1,
	note,
	ZKAssetContractRef
};