import {compile, NetworkProvider} from "@ton-community/blueprint";
import {JettonMinter} from "../wrappers/JettonMinter";
import {Address, toNano} from "ton-core";

export async function run(provider: NetworkProvider) {
    let codeWallet = await compile('JettonWallet');

    // const jetton = provider.open(
    //     JettonMinter.createFromConfig(
    //         {
    //             adminAddress: Address.parse("EQBSV_u2NPNNymFZgX0VqRwu2v6cTJo7symgqKFwzcNZ7jp9"),
    //             content: "https://api.tonnel.network/jetton/metadata",
    //             jettonWalletCode: codeWallet
    //         },
    //         await compile('JettonMinter')
    //     )
    // );
    // await jetton.sendDeploy(provider.sender(), toNano('0.05'));
    // await provider.waitForDeploy(jetton.address);
}