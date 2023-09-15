import {Address, beginCell, toNano} from 'ton-core';
import {compile, NetworkProvider} from '@ton-community/blueprint';
import {TonnelJetton} from "../wrappers/TonnelJetton";
import {JettonMinter} from "../wrappers/JettonMinter";

export async function run(provider: NetworkProvider) {
  // let codeWallet = await compile('JettonWallet');
  //
  // const jetton = provider.open(
  //   JettonMinter.createFromConfig(
  //     {
  //       adminAddress: Address.parse("EQBmVo--5CGcB1YdclgIUvUY-949a0ivzC1Cw9_J3l7ayxnT"),
  //       content: beginCell().endCell(),
  //       jettonWalletCode: codeWallet
  //     },
  //     await compile('JettonMinter')
  //   )
  // );
  //   await jetton.sendDeploy(provider.sender(), toNano('0.05'));
  //   await provider.waitForDeploy(jetton.address);

    const jettonTonnel = provider.open(JettonMinter.createFromAddress(
        Address.parse("EQAMcImLBgZHazWmradz51pI0uHZwvxMONlMQy0QwQTQInD5"),
    ));
    let jettonWallet = await jettonTonnel.getWalletCell();
  //
  //
  //
  const tonnel = provider.open(
    TonnelJetton.createFromConfig(
        {
            ownerAddress: Address.parse("EQBmVo--5CGcB1YdclgIUvUY-949a0ivzC1Cw9_J3l7ayxnT"),
            jettonMinterAddress: jettonTonnel.address,
            jettonWalletBytecode: jettonWallet.cell,
            tonnelJettonAddress: jettonTonnel.address,
            relayerTonnelMint: 50,
            depositorTonnelMint: 10
        },
      await compile('TonnelJetton')
    )
  );

  await tonnel.sendDeploy(provider.sender(), toNano('0.05'));

  await provider.waitForDeploy(tonnel.address);
  await new Promise(resolve => setTimeout(resolve, 10000));
  await tonnel.sendContinue(provider.sender(), {
    value: toNano('0.8'),
  });
  await new Promise(resolve => setTimeout(resolve, 10000));

  await tonnel.sendContinue(provider.sender(), {
    value: toNano('0.8'),
  });
    await new Promise(resolve => setTimeout(resolve, 10000));

    // console.log('done')
  // const jetton = provider.open(
  //   JettonMinter.createFromAddress(Address.parse('EQAWhsZ-_7ccKSyPE08eH5cUH2hq0rrtePVzwKXTnnzzwnu9')))
  // await jettonTonnel.sendMint(provider.sender(), {
  //   toAddress: Address.parse("kQCTe7B0zXSSY8UZ1TXZ96mnMNGKPF8Yj8qS-9PAmFpE5mDh"),
  //   jettonAmount: toNano('10000'),
  //   amount: toNano('0.02'),
  //   queryId: 1,
  //   value: toNano('0.05')
  // })
    await jettonTonnel.sendMintAccess(provider.sender(), {

        value: toNano('0.02'),
        queryId: 0,
        mintAccess: tonnel.address

    })
}





