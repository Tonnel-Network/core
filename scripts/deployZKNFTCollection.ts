import {Address, beginCell, toNano} from 'ton-core';
import {compile, NetworkProvider} from '@ton-community/blueprint';
import {NFTCollection} from "../wrappers/NFTCollection";
import {NFTItem} from "../wrappers/NFTItem";
import {ZKNFTCollection} from "../wrappers/ZKNFTCollection";
import {JettonMinter} from "../wrappers/JettonMinter";
import {Blockchain} from "@ton-community/sandbox";
import {rbuffer, toBigIntLE} from "../utils/circuit";
import {Sha256} from "../utils/merkleTree";
import {JettonWallet} from "../wrappers/JettonWallet";

export async function run(provider: NetworkProvider) {
  let codeCollection = await compile('ZKNFTCollection');
  let codeItem = await compile('NFTItem');
  const jettonTonnel = provider.open(JettonMinter.createFromAddress(
    Address.parse("EQAMcImLBgZHazWmradz51pI0uHZwvxMONlMQy0QwQTQInD5"),
  ));

  let jettonWallet = await jettonTonnel.getWalletCell();
  console.log(jettonWallet)
  // console.log(jettonWallet);
  // const nftCollection = provider.open(
  //   ZKNFTCollection.createFromConfig(
  //     {
  //       adminAddress: Address.parse("EQBmVo--5CGcB1YdclgIUvUY-949a0ivzC1Cw9_J3l7ayxnT"),
  //       nftItemCode: codeItem,
  //       masterJetton: jettonTonnel.address,
  //       jettonWalletCell: jettonWallet.cell
  //     },
  //     codeCollection
  //   )
  // );
  const nftCollection = provider.open(
    ZKNFTCollection.createFromAddress(
      Address.parse("EQBVa8wuT_P8faSnXDE-HW9DDZu0u_05pfERigXwH7NvsASs"),
    )
  );



  const randomBuf = rbuffer(31);
  const secret = toBigIntLE(randomBuf);
  console.log(secret);
  const id = 0
  const commitment = Sha256(id.toString(), secret.toString());
  console.log(commitment);

  const jettonWalletMinter = provider.open(
    JettonWallet.createFromAddress(await jettonTonnel.getWalletAddress(Address.parse("EQBmVo--5CGcB1YdclgIUvUY-949a0ivzC1Cw9_J3l7ayxnT"))))


  let mintResult = await jettonWalletMinter.sendTransfer(provider.sender(), {
    value: toNano('1.55'),
    toAddress: nftCollection.address,
    queryId: 0,
    fwdAmount: toNano('1.5'),
    jettonAmount: toNano('1000'),
    fwdPayload: beginCell()
      .storeCoins(toNano('0.02')) // gas fee
      .storeRef(beginCell().storeUint(BigInt(commitment), 256).storeUint(id, 32).endCell())
      .endCell(),
  });




}





