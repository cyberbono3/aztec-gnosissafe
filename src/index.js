
const eth  =  require("./ConManager.js");
const aztec     =  require("./ContractsAdapter");
const HDWalletProvider = require("truffle-hdwallet-provider");

function generateAccounts(){
    const alice =  aztec.secp256k1.generateAccount();
    const bob   =  aztec.secp256k1.generateAccount();

    console.log("alice addr:"+alice.address);
    console.log("alice publicKey:"+alice.publicKey);
    console.log("alice privateKey:"+alice.privateKey);

    console.log("bob addr:"+bob.address);
    console.log("bob publicKey:"+bob.publicKey);
    console.log("bob privateKey:"+bob.privateKey);
}
//generateAccounts();

var alice = {};
alice.address='0xF99dbd3CFc292b11F74DeEa9fa730825Ee0b56f2';
alice.publicKey='0x045cc600bcb5d82aaeb923268828e295533252bfe90c8642d11b1ec807f1f7128aafc9805886191bacb8eba8819b44411eb3114338c6ed6dcc8170b411fe6bb262';
alice.privateKey = '0xa843e586cdf38b09ddcc6456ae555f18711371ef72334f1e6154501fba8be1cc';

var bob = {};
bob.address='0x0F8399780083A65FC9eE18EE54E0714c2f706885';
bob.publicKey='0x04148c44ea3f957eb1e59e841d93162044902476e006b7f128ac72893145d2dc115eddf739249c2b299c639546eb3d0c8ba5637a53d3343f69ee21ae5593a5626b';
bob.privateKey='0xdc3d41e11bb8d4d498aa60c3a1d329c41674f1ef76f3ad63ad4097a96020214a';

async function main(){

    var zkAssetAlice = await aztec.ZKAssetContractRef(eth, 0);

    // get web3 Ethereum accounts and setup default transaction options
    let accounts  = {};//await eth.getAccounts();
    accounts[0] = alice.address;
    accounts[1] = bob.address;

	let txOptions = [
        {from: accounts[0], gasLimit: "0x47B760", gasPrice: "0x12A05F200"},
        {from: accounts[1], gasLimit: "0x47B760", gasPrice: "0x12A05F200"}
    ];

    // reuse or deploy AZTEC contracts (CryptoEngine, proof validators and ZkAssetMintable)
	let instances = await aztec.instantiate(eth, txOptions[0], false);
    
    // ---------------------------------------------------------------------------------------------
    // Minting inital supply of confidental asset ERC20
    const erc20totalSupply = 150;
    console.log(`minting ${erc20totalSupply} erc20 tokens (initial owner: alice)`);
    await instances.erc20.mint(accounts[0], erc20totalSupply, txOptions[0]);

    // delegate erc20 token access from account[0] to AZTEC.ACE contract
    await instances.erc20.approve(
		instances.ace.address,
		erc20totalSupply,
		txOptions[0]
	);
    await logERC20balances(instances.erc20, accounts);

    // ---------------------------------------------------------------------------------------------
    // accounts[0] makes a deposit
    console.log("alice shields 150 erc20 tokens to AZTEC notes");
    const aliceNotes = [
		aztec.note.create(alice.publicKey, 100),
		aztec.note.create(alice.publicKey, 50),
	];
    await aztec.shieldsERC20toZkAsset(
        [],
        [],
        aliceNotes,
        zkAssetAlice,
        instances.ace,
        instances.joinSplit,
        accounts[0],
        txOptions[0]
    );
    await logERC20balances(instances.erc20, accounts);
    
    // ---------------------------------------------------------------------------------------------
    // confidential transfer
    console.log("alice privately transfers 150 AZTEC notes to bob");
    const bobNotes = [
        aztec.note.create(bob.publicKey, 75),
        aztec.note.create(bob.publicKey, 75),
    ];
    await aztec.confidentialTransfer(
        aliceNotes, 
        [alice, alice],
        bobNotes, 
        zkAssetAlice,
        instances.joinSplit,
        accounts[0],
        txOptions[0],
        false
    );
    await logERC20balances(instances.erc20, accounts);

    // ---------------------------------------------------------------------------------------------
    // Confidential transfer to accounts[1]
    console.log("bob unshields 100 AZTEC notes (to erc20 tokens)");
    const bobNotes_1 = [
        aztec.note.create(bob.publicKey, 25),
        aztec.note.create(bob.publicKey, 25),
    ] 
    // since we do a utxo transaction with 150 as input (bobNotes) and 50 as output (bobNotes_1)
    // we're left with a positive balance of 100 that will be unshielded to ERC20 tokens

    var zkAsset = await aztec.ZKAssetContractRef(eth, 1); //1 means use bob private key for interaction with AKAsset contract

    await aztec.confidentialTransfer(
        bobNotes, 
        [bob, bob],
        bobNotes_1, 
        zkAsset,
        instances.joinSplit,
        accounts[1],
        txOptions[0],
        false
    );
    await logERC20balances(instances.erc20, accounts);

    process.exit(0);
}

async function logERC20balances(erc20, accounts){
    const erc20totalSupply = (await erc20.totalSupply()).toNumber();
    const erc20balances    = [ 
        (await erc20.balanceOf(accounts[0])).toNumber(),
        (await erc20.balanceOf(accounts[1])).toNumber()
    ];
    const shieldedSupply = erc20totalSupply - erc20balances[0] - erc20balances[1];

    console.log("erc20 balances:\n")
    console.log("alice               " + erc20balances[0]);
    console.log("bob                 " + erc20balances[1]);
    console.log("shielded in ZkAsset " + shieldedSupply);
    console.log("total supply        " + erc20totalSupply);
}

main();