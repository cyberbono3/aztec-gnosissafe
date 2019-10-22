
const pantheon = require("./ConManager.js");
const aztec = require("./ContractsAdapter");
const Web3 = require("web3");
const HDWalletProvider = require("truffle-hdwallet-provider");
const lineBreak = "________________________________________________________________________\n";

/*
    This example:
    1. Connect to Pantheon blockchain
    2. Deploy AZTEC contracts
    3. Mint a public ERC20 with an initial supply
    4. Shields ERC20 token to private AZTEC notes
    4. Privately transfers AZTEC notes
    5. Unshields AZTEC notes to ERC20 tokens

*/
function generateAccounts() {
    // generate random AZTEC accounts for alice and bob
    // note: while these accounts live on the same curve than Ethereum addresses, they can be distinct
    // from Ethereum accounts. Though in practice, the AZTEC transaction (manipulating notes owned
    // by alice and bob) would need to be signed by a valid Ethereum account (presumably owned by
    // alice or bob)
    const alice = aztec.secp256k1.generateAccount();
    const bob = aztec.secp256k1.generateAccount();

    console.log("alice addr:" + alice.address);
    console.log("alice publicKey:" + alice.publicKey);
    console.log("alice privateKey:" + alice.privateKey);

    console.log("bob addr:" + bob.address);
    console.log("bob publicKey:" + bob.publicKey);
    console.log("bob privateKey:" + bob.privateKey);
}
//generateAccounts();
var gnosisMultiSig = '0xd4C5e3553385c3Aa47B3367a01Df515D66d1BF80';
var alice = {};
alice.address = '0xF99dbd3CFc292b11F74DeEa9fa730825Ee0b56f2';
alice.publicKey = '0x045cc600bcb5d82aaeb923268828e295533252bfe90c8642d11b1ec807f1f7128aafc9805886191bacb8eba8819b44411eb3114338c6ed6dcc8170b411fe6bb262';
alice.privateKey = '0xa843e586cdf38b09ddcc6456ae555f18711371ef72334f1e6154501fba8be1cc';

var bob = {};
bob.address = '0x0F8399780083A65FC9eE18EE54E0714c2f706885';
bob.publicKey = '0x04148c44ea3f957eb1e59e841d93162044902476e006b7f128ac72893145d2dc115eddf739249c2b299c639546eb3d0c8ba5637a53d3343f69ee21ae5593a5626b';
bob.privateKey = '0xdc3d41e11bb8d4d498aa60c3a1d329c41674f1ef76f3ad63ad4097a96020214a';

async function main() {
    const provider = new HDWalletProvider("a843e586cdf38b09ddcc6456ae555f18711371ef72334f1e6154501fba8be1cc",
        "https://rpc.slock.it/goerli"
        //"http://10.10.4.30:8645"
    );
    var multiSigExe = true;

    var web3 = new Web3(provider);


    var zkAssetAlice = await aztec.ZKAssetContractRef(pantheon, 0);

    // get web3 Ethereum accounts and setup default transaction options
    let accounts = {};//await pantheon.getAccounts();
    accounts[0] = alice.address;
    accounts[1] = bob.address;

    let txOptions = [
        { from: accounts[0], gasLimit: "0x47B760", gasPrice: "0x12A05F200" },
        { from: accounts[1], gasLimit: "0x47B760", gasPrice: "0x12A05F200" }
    ];

    // reuse or deploy AZTEC contracts (CryptoEngine, proof validators and ZkAssetMintable)
    let instances = await aztec.instantiate(pantheon, txOptions[0], false);

    // ---------------------------------------------------------------------------------------------
    // Minting inital supply of confidental asset ERC20
    const erc20totalSupply = 150;
    console.log(`minting ${erc20totalSupply} erc20 tokens (initial owner: alice)`);
    await instances.erc20.mint(
        multiSigExe ? gnosisMultiSig : accounts[0],
        erc20totalSupply, txOptions[0]);

    if (multiSigExe) {
        var payloadApprove = web3.eth.abi.encodeFunctionCall({
            "constant": false,
            "inputs": [
                {
                    "name": "spender",
                    "type": "address"
                },
                {
                    "name": "value",
                    "type": "uint256"
                }
            ],
            "name": "approve",
            "outputs": [
                {
                    "name": "",
                    "type": "bool"
                }
            ],
            "payable": false,
            "stateMutability": "nonpayable",
            "type": "function"
        }, [instances.ace.address,
                erc20totalSupply]);
        // Executing aztec.exeMultiSig
        await aztec.exeMultiSig(payloadApprove, instances.erc20.address, web3);
        //Executed aztec.exeMultiSig
    }
    else {
        // delegate erc20 token access from account[0] to AZTEC.ACE contract
        await instances.erc20.approve(
            instances.ace.address,
            erc20totalSupply,
            txOptions[0]
        );
    }
    await logERC20balances(instances.erc20, accounts);

    // ---------------------------------------------------------------------------------------------
    // accounts[0] makes a deposit
    console.log("alice shields 150 erc20 tokens to AZTEC notes");
    const aliceNotes = [
        aztec.note.create( alice.publicKey, 100),
        aztec.note.create( alice.publicKey, 50),
    ];
    console.log("Multisig: ", multiSigExe) //multiSigExe must be true
    await aztec.shieldsERC20toZkAsset(
        [],
        [],
        aliceNotes,
        zkAssetAlice, //aztec issue maybe to deploy ZkAsset for Multisig?
        instances.ace,
        instances.joinSplit,
        multiSigExe ? gnosisMultiSig :accounts[0],
        txOptions[0],
        multiSigExe
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
        multiSigExe ? gnosisMultiSig : accounts[0],
        txOptions[0],
        multiSigExe,
        true
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

    var zkAsset = await aztec.ZKAssetContractRef(pantheon, 1); //1 means use bob private key for interaction with AKAsset contract

    await aztec.confidentialTransfer(
        bobNotes,
        [bob, bob],
        bobNotes_1,
        zkAsset, //? zkassertAlice  ,multisig
        instances.joinSplit,
        accounts[1],
        txOptions[1],
        false
    );
    await logERC20balances(instances.erc20, accounts);

    // ---------------------------------------------------------------------------------------------
    // confidentialTransfer from bob to alice
    /*console.log("bob privately transfers 20 AZTEC notes and 30 erc20 tokens to alice");
    const aliceNotes_1 = [
        aztec.note.create(alice.publicKey, 20),
    ] // bobNotes_1 value is 50, output aztec notes = 20. 
    await aztec.confidentialTransfer(
        bobNotes_1, 
        [bob, bob],
        aliceNotes_1, 
        instances.zkAsset,
        instances.joinSplit,
        accounts[0],
        txOptions[0],
        false
    );
    await logERC20balances(instances.erc20, accounts);*/

    process.exit(0);
}

async function logERC20balances(erc20, accounts) {
    const erc20totalSupply = (await erc20.totalSupply()).toNumber();
    const erc20balances = [
        (await erc20.balanceOf(accounts[0])).toNumber(),
        (await erc20.balanceOf(accounts[1])).toNumber()
    ];
    const shieldedSupply = erc20totalSupply - erc20balances[0] - erc20balances[1];

    var multisigBalance = (await erc20.balanceOf(gnosisMultiSig)).toNumber();

    console.log(lineBreak);
    console.log("erc20 balances:\n")
    console.log("alice                  " + erc20balances[0]);
    console.log("bob                    " + erc20balances[1]);
    console.log("shielded in ZkAsset    " + shieldedSupply);
    console.log("total supply           " + erc20totalSupply);
    console.log("multisig erc20 balance "+multisigBalance);
    console.log(lineBreak);
}


main();