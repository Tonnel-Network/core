import {Address, toNano} from 'ton-core';
import {Tonnel} from '../wrappers/Tonnel';
import {compile, NetworkProvider} from '@ton-community/blueprint';
import {JettonMinter} from "../wrappers/JettonMinter";

export async function run(provider: NetworkProvider) {
  const jettonTonnel = provider.open(JettonMinter.createFromAddress(
      Address.parse("EQAMcImLBgZHazWmradz51pI0uHZwvxMONlMQy0QwQTQInD5"),
  ));
  // const tonnel = provider.open(
  //   Tonnel.createFromConfig(
  //     {
  //       ownerAddress: Address.parse("EQBmVo--5CGcB1YdclgIUvUY-949a0ivzC1Cw9_J3l7ayxnT"),
  //       tonnelJettonAddress: jettonTonnel.address,
  //       depositorTonnelMint: 20,
  //       relayerTonnelMint: 30,
  //
  //     },
  //     await compile('Tonnel')
  //   )
  // );
  //
  // await tonnel.sendDeploy(provider.sender(), toNano('0.05'));
  //
  // await provider.waitForDeploy(tonnel.address);
  //
  // await new Promise(resolve => setTimeout(resolve, 10000));
  // await tonnel.sendContinue(provider.sender(), {
  //   value: toNano('0.65'),
  // });
  // await new Promise(resolve => setTimeout(resolve, 10000));
  const tonnel = provider.open(
    Tonnel.createFromAddress(Address.parse('EQBZtVkjTMJL7e34SDJkTsYyOi4qg4A0DPVXf5XlznJ2kBD1')))

  // await tonnel.sendContinue(provider.sender(), {
  //   value: toNano('0.8'),
  // });
  // console.log('done')
  // await new Promise(resolve => setTimeout(resolve, 10000));

  await jettonTonnel.sendMintAccess(provider.sender(), {

    value: toNano('0.02'),
    queryId: 0,
    mintAccess: tonnel.address

  })

}





