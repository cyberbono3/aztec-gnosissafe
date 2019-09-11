
const HDWalletProvider = require("truffle-hdwallet-provider");
const contract = require("truffle-contract");
//const Web3 = require("web3");
const path = require("path");

const privateKey = "79A38A9AD1B5508FB6A14584A70B6B0360BA9DC3F590B32B49831CCADCD6B7AB";

const privateKeys = 
  ["a843e586cdf38b09ddcc6456ae555f18711371ef72334f1e6154501fba8be1cc",  //alice private key
   "dc3d41e11bb8d4d498aa60c3a1d329c41674f1ef76f3ad63ad4097a96020214a"]; //bob private key

const ethNode = "https://rpc.slock.it/goerli";//"http://10.10.4.30:8645";
//var web3;

// returns a truffle-contract 
async function readContract(abi, privateKeyIndex = 0) {
  var pathFromNodeModule="../node_modules/@aztec/contract-artifacts/artifacts/";
  var pathContracts = "../contracts/";

  const provider = new HDWalletProvider(privateKeys[privateKeyIndex], ethNode);
  //web3 = new Web3(provider);

  let artifact = require(path.join(pathContracts, abi));
  let toReturn = contract(artifact);
  toReturn.setProvider(provider);
  return toReturn
}

async function getAccounts() {
  // const accounts = await web3.eth.getAccounts();
  const accounts = [
    "0x4A57Bbf8666E532eDA673f8d76C90e13F1bc9371",
    "0x7307DDf6A24cBE2e33e476904AF02743Bb5A57B2"
  ]
  return accounts;
}

module.exports = {
  //web3,
  readContract,
  getAccounts
};