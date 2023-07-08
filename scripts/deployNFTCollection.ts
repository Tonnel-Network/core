import {Address, beginCell, toNano} from 'ton-core';
import {compile, NetworkProvider} from '@ton-community/blueprint';
import {NFTCollection} from "../wrappers/NFTCollection";

export async function run(provider: NetworkProvider) {
  let codeCollection = await compile('NFTCollection');
  let codeItem = await compile('NFTItem');

  const nftCollection = provider.open(
    NFTCollection.createFromConfig(
      {
        adminAddress: Address.parse("EQBmVo--5CGcB1YdclgIUvUY-949a0ivzC1Cw9_J3l7ayxnT"),
        nftItemCode: codeItem
      },
      codeCollection
    )
  );

  await nftCollection.sendDeploy(provider.sender(), toNano('0.05'));


  await provider.waitForDeploy(nftCollection.address);


}





