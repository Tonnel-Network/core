import {Address, toNano} from 'ton-core';
import {Tonnel} from '../wrappers/Tonnel';
import {compile, NetworkProvider} from '@ton-community/blueprint';

export async function run(provider: NetworkProvider) {
  const tonnel = provider.open(
    Tonnel.createFromConfig(
      {
        ownerAddress: Address.parse("EQBmVo--5CGcB1YdclgIUvUY-949a0ivzC1Cw9_J3l7ayxnT")
      },
      await compile('Tonnel')
    )
  );

  await tonnel.sendDeploy(provider.sender(), toNano('0.05'));

  await provider.waitForDeploy(tonnel.address);

  await new Promise(resolve => setTimeout(resolve, 10000));
  await tonnel.sendContinue(provider.sender(), {
    value: toNano('0.65'),
  });
  await new Promise(resolve => setTimeout(resolve, 10000));

  await tonnel.sendContinue(provider.sender(), {
    value: toNano('0.8'),
  });
  console.log('done')

}





