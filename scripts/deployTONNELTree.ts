import {compile, NetworkProvider} from "@ton-community/blueprint";
import {Address, toNano} from "ton-core";
import {Drill} from "../wrappers/Drill";
import {JettonMinter} from "../wrappers/JettonMinter";
import {TonnelTree} from "../wrappers/TonnelTree";

export async function run(provider: NetworkProvider) {

    // const tonnelTree = provider.open(
    //     TonnelTree.createFromConfig(
    //         {
    //             ownerAddress: Address.parse("UQBSV_u2NPNNymFZgX0VqRwu2v6cTJo7symgqKFwzcNZ7me4"),
    //             JettonAddress: Address.parse("EQDNDv54v_TEU5t26rFykylsdPQsv5nsSZaH_v7JSJPtMitv"),
    //             minerAddress: Address.parse("EQDNDv54v_TEU5t26rFykylsdPQsv5nsSZaH_v7JSJPtMitv"),
    //         },
    //         await compile('TonnelTree')
    //     )
    // );

    const tonnelTree = provider.open(
        TonnelTree.createFromAddress(Address.parse('EQAwrorAS9dhU3TqwL78wfbBrAsqBKD7CyGzLuwzNj3LYm3B')))

    // await tonnelTree.sendDeploy(provider.sender(), toNano('0.1'));
    // await provider.waitForDeploy(tonnelTree.address);
    // await vesting.sendClaimTONNEL(provider.sender(),toNano('0.05'), toNano('1'))
    // const jetton = provider.open(
    //   JettonMinter.createFromAddress(Address.parse('EQDNDv54v_TEU5t26rFykylsdPQsv5nsSZaH_v7JSJPtMitv')))
    // await new Promise(resolve => setTimeout(resolve, 15000));
    // await jetton.sendMintAccess(provider.sender(), {
    //     value: toNano('0.02'),
    //     queryId: 0,
    //     mintAccess: tonnelTree.address
    // })
    await tonnelTree.sendSetMiner(provider.sender(), {
        miner: Address.parse('EQDnp89hEqOlak2ydKmlUGuTSNi8NhWvSPEP1mQu1hY30vny'),
        value: toNano('0.05'),
        miner_fee: toNano('0.24')
    })
}