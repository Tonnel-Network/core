import {compile, NetworkProvider} from "@ton-community/blueprint";
import {Address, beginCell, toNano} from "ton-core";
import {Miner} from "../wrappers/Miner";
const get32BitsOfInstance = (instance: Address) => {
    const addressSlice = beginCell().storeAddress(instance).endCell()
    return addressSlice.beginParse().loadUint(32)

}
export async function run(provider: NetworkProvider) {

    // const miner = provider.open(
    //     Miner.createFromConfig(
    //         {
    //             JettonMasterAddress: Address.parse("EQDNDv54v_TEU5t26rFykylsdPQsv5nsSZaH_v7JSJPtMitv"),
    //             ADMIN_ADDRESS: Address.parse("UQBSV_u2NPNNymFZgX0VqRwu2v6cTJo7symgqKFwzcNZ7me4"),
    //             REWARD_SWAP_ADDRESS: Address.parse("EQCKX83-eTN8kpTlfXppJu-lhbnDOa6xYSSODU2R8AvTMS9d"),
    //             TONNEL_TREE_ADDRESS: Address.parse("EQAwrorAS9dhU3TqwL78wfbBrAsqBKD7CyGzLuwzNj3LYm3B"),
    //         },
    //         await compile('Miner')
    //     )
    //
    //
    //
    // );
    //
    // await miner.sendDeploy(provider.sender(), toNano('0.1'));
    // await provider.waitForDeploy(miner.address);


    const miner = provider.open(
        Miner.createFromAddress(Address.parse('EQDnp89hEqOlak2ydKmlUGuTSNi8NhWvSPEP1mQu1hY30vny'))
    )
    const rates = [
        { rate: 5 , address: 'EQCNoApBzMacKKdTwcvi1iOx78e98bTSaN1Gx_nnmd3Ek5Yn'},
        { rate: 4 , address: 'EQASyc8d2DjZHrFevnF432NRLc4qwh6HGUPAbMvbofMkeRZl'},
        { rate: 15 , address: 'EQDzAhS3Ev8cxEBJ96MIqPjxyD_k0L3enzDWnQ3Z-4tUK1h5'},
        { rate: 250 , address: 'EQAgoyECSzCIFTFkMIvDLgdUE3D9RxGfYQQGfxy3lBBc_Ke_'},
        { rate: 666 , address: 'EQDTs-yjPLn7XzaRRq8pjp7H8Nw4y_OJ51Bk2dcrPlIYgwtV'},
        { rate: 1 , address: 'EQBemaU1eAM-fJP7tSniJGEmltPjitgGnlrP6UaXI7nzmEuV'},
        { rate: 1 , address: 'EQAn75s-SP2f1uTRW4jM493kP3LqtG_pMdoUgcKkU3MRsP-G'},
        { rate: 9 , address: 'EQBZ0-2-isPEN_lIyg9eqXO_RFWrl_PWIJq5K6SVcUwne23W'},
        { rate: 100 , address: 'EQBYpQiQMwGBMzhOlJ52e4yXmcKCB_5uTTJ7bVSGqr-8YANi'},
        { rate: 500 , address: 'EQB-s4WzIgGP9U6DNlFH_kSn0JuxhBCBXr_rKz2ztEiozTto'},
    ]
    for (let i = 3; i < rates.length; i++) {
        await miner.sendSetRate(provider.sender(),{
            value: toNano('0.02'),
            rate: BigInt(rates[i].rate),
            pool: get32BitsOfInstance(Address.parse(rates[i].address)),
        })

        await new Promise(resolve => setTimeout(resolve, 20000))
        break
    }


}