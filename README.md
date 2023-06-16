# Tonnel Network
This is the first fully functioning [tornado-core](https://github.com/tornadocash/tornado-core) implementation on TON blockchain. It is based on circom and snarkjs libraries. It is a fully decentralized and trustless implementation. It is also the first implementation of circom and snarkjs on TON blockchain.

This repository contains the following components and it's based on this [repository](https://github.com/SaberDoTcodeR/ton-zk-verifier):
- Circom circuits in the [circuits folder](circuits/)
- Func contracts in the [contracts folder](contracts/) 
- Tests in the [test folder](test/) that covers a few different scenarios

## How to build
```bash
npm install
npm run build
```

## How to run test
```bash
npm run test
```


## Important notes
This is only working on testnet now. It is not working on mainnet until the next update of TON blockchain and BLS12-381 opcodes are added to the mainnet.

## What is Tonnel Network?
Tonnel Network is a fully decentralized and trustless implementation of tornado cash on TON blockchain. It will let 
users deposit TON into a smart contract and withdraw them later in a way that the deposited TON are not linked to the
withdrawn TON. Users can deposit TON in a specific denomination and withdraw them later in the same denomination.

## Todo
- [x] Implement the merkle tree functionality and write tests for it
- [x] Implement the [MIMCSponge hash](https://github.com/SaberDoTcodeR/Tonnel-Network/blob/main/contracts/MiMcSponge.fc) function in func(It was too expensive so I used Sha256 instead)
- [x] Implement the deposit and withdraw functionality and write tests for them
- [ ] Build a frontend for the contract (I will need help with this, contact me on TG if you are interested:) - The current version of the frontend is [here](https://tonnel.network)
- [ ] Implement an indexer for the contract so that the frontend can easily generate the merkle tree and proofs for withdraw


## Demo 
You can see a demo of the contract [here](https://tonnel.network). It is [deployed](https://testnet.tonscan.org/address/EQAGVfMkbxcsxWOkCnh4QIO6HHlBnaxETwVz6AoliXf2ndvf) on testnet and you can deposit and withdraw TON on it. The frontend is fully functional but it is not optimized yet. It is only for testing purposes.



