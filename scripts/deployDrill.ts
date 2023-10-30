import {compile, NetworkProvider} from "@ton-community/blueprint";
import {Address, toNano} from "ton-core";
import {Drill} from "../wrappers/Drill";
import {JettonMinter} from "../wrappers/JettonMinter";

export async function run(provider: NetworkProvider) {
    const jettonLP = provider.open(JettonMinter.createFromAddress(
        Address.parse("EQAvtGe8Nep_XncmQYJrqzWjjdsTaygzL17bvH_8Rjryz1xu"),
    ));
    let jettonWallet = await jettonLP.getWalletCell();
    const drill = provider.open(
        Drill.createFromConfig(
            {
                ownerAddress: Address.parse("UQBSV_u2NPNNymFZgX0VqRwu2v6cTJo7symgqKFwzcNZ7me4"),
                lpBytecode: jettonWallet.cell,
                lpMinterAddress: jettonLP.address,
                rewardMinterAddress: Address.parse("EQDNDv54v_TEU5t26rFykylsdPQsv5nsSZaH_v7JSJPtMitv"),
            },
            await compile('Drill')
        )
    );
    await drill.sendDeploy(provider.sender(), toNano('0.05'));
    await provider.waitForDeploy(drill.address);
    // await vesting.sendClaimTONNEL(provider.sender(),toNano('0.05'), toNano('1'))
    const jetton = provider.open(
      JettonMinter.createFromAddress(Address.parse('EQDNDv54v_TEU5t26rFykylsdPQsv5nsSZaH_v7JSJPtMitv')))
    await new Promise(resolve => setTimeout(resolve, 15000));
    await jetton.sendMintAccess(provider.sender(), {
        value: toNano('0.02'),
        queryId: 0,
        mintAccess: drill.address
    })
}