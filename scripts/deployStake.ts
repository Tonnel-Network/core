import {Address, beginCell, toNano} from 'ton-core';
import {compile, NetworkProvider} from '@ton-community/blueprint';
import {NFTCollection} from "../wrappers/NFTCollection";
import {NFTItem} from "../wrappers/NFTItem";
import {ZKNFTCollection} from "../wrappers/ZKNFTCollection";
import {JettonMinter} from "../wrappers/JettonMinter";
import {Blockchain} from "@ton-community/sandbox";
import {groth16, parseG1Func, parseG2Func, rbuffer, toBigIntLE} from "../utils/circuit";
import {mimcHash2, Sha256} from "../utils/merkleTree";
import {JettonWallet} from "../wrappers/JettonWallet";
import MerkleTree from "fixed-merkle-tree";
import path from "path";
import {Stake} from "../wrappers/Stake";
const wasmPathInsert = path.join(__dirname, "../build/insert/circuit.wasm");
const zkeyPathInsert = path.join(__dirname, "../build/insert/circuit_final.zkey");
const vkeyInsertPath = path.join(__dirname, "../build/insert/verification_key.json");
const vkeyInsert = require(vkeyInsertPath);

export async function run(provider: NetworkProvider) {
    let codeWallet = await compile('Stake');

    const jettonTonnel = provider.open(JettonMinter.createFromAddress(
    Address.parse("EQDNDv54v_TEU5t26rFykylsdPQsv5nsSZaH_v7JSJPtMitv"),
  ));

  let jettonWallet = await jettonTonnel.getWalletCell();

  // const stake = provider.open(
  //   Stake.createFromConfig(
  //     {
  //         admin: Address.parse("UQBSV_u2NPNNymFZgX0VqRwu2v6cTJo7symgqKFwzcNZ7me4"),
  //         jettonMinterAddress: jettonTonnel.address,
  //         jettonWalletBytecode: jettonWallet.cell
  //     },
  //       codeWallet
  //   )
  // );
  //   await stake.sendDeploy(provider.sender(), toNano('0.1'));
  //   await provider.waitForDeploy(stake.address);
  //         await new Promise((resolve) => setTimeout(resolve, 10000));

    const stake = provider.open(Stake.createFromAddress(
        Address.parse("EQBy8B_1rdhrWPHys1xZpYUmRmjCgokleVoSMPs-aQKxctRq"),
    ));

    await stake.sendClaimTonnel(provider.sender(), {
        amount: toNano('1'),
        value: toNano('0.05'),
    })


}





