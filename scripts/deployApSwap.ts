import {compile, NetworkProvider} from "@ton-community/blueprint";
import {Address, toNano} from "ton-core";
import {Drill} from "../wrappers/Drill";
import {JettonMinter} from "../wrappers/JettonMinter";
import {TonnelTree} from "../wrappers/TonnelTree";
import {APSwap} from "../wrappers/APSwap";

export async function run(provider: NetworkProvider) {

    // const apswap = provider.open(
    //     APSwap.createFromConfig(
    //         {
    //             JettonMasterAddress: Address.parse('EQDNDv54v_TEU5t26rFykylsdPQsv5nsSZaH_v7JSJPtMitv'),
    //             ADMIN_ADDRESS: Address.parse('UQBSV_u2NPNNymFZgX0VqRwu2v6cTJo7symgqKFwzcNZ7me4'),
    //             MINER_ADDRESS: Address.parse('UQBSV_u2NPNNymFZgX0VqRwu2v6cTJo7symgqKFwzcNZ7me4'),
    //             start: 1708106400
    //         },
    //         await compile('APSwap')
    //     )
    // );
    //
    // await apswap.sendDeploy(provider.sender(), toNano('0.1'));
    // await provider.waitForDeploy(apswap.address);
    const apswap = provider.open(
        APSwap.createFromAddress(Address.parse('EQCKX83-eTN8kpTlfXppJu-lhbnDOa6xYSSODU2R8AvTMS9d')))
    // const jetton = provider.open(
    //   JettonMinter.createFromAddress(Address.parse('EQDNDv54v_TEU5t26rFykylsdPQsv5nsSZaH_v7JSJPtMitv')))
    // await new Promise(resolve => setTimeout(resolve, 35000));
    // await jetton.sendMintAccess(provider.sender(), {
    //     value: toNano('0.02'),
    //     queryId: 0,
    //     mintAccess: apswap.address
    // })

    await apswap.sendSetMiner(provider.sender(), toNano('0.05'), Address.parse('EQDnp89hEqOlak2ydKmlUGuTSNi8NhWvSPEP1mQu1hY30vny'))
    // console.log(await apswap.getTONNELVirtualBalance())
    // console.log(await apswap.getExpectedReturn(toNano('1')))

}