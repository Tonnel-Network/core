import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider, Dictionary,
  Sender,
  SendMode, toNano
} from 'ton-core';
import {TupleItemSlice} from "ton-core/dist/tuple/tuple";
import {CellRef} from "./ZKNFTCollection";

export type TonnelJettonConfig = {
  ownerAddress: Address;
  jettonMinterAddress: Address;
  jettonWalletBytecode: Cell;
  tonnelJettonAddress: Address;
  depositorTonnelMint: number;
  relayerTonnelMint: number;
  protocolFee: number; // out of 1000

};

export function tonnelConfigToCell(config: TonnelJettonConfig): Cell {
  const roots = Dictionary.empty(Dictionary.Keys.BigUint(8), CellRef)
  roots.set(BigInt(0), beginCell().storeUint(43859932230369129483580312926473830336086498799745261185663267638134570341235n, 256).endCell())

  return beginCell()
      .storeRef(beginCell().storeUint(0,8).storeUint(0,32).storeDict(roots).endCell())
    .storeRef(
      beginCell()
        .storeAddress(config.ownerAddress)
        .storeAddress(config.tonnelJettonAddress)
          .storeUint(config.protocolFee, 16)
          .storeUint(config.depositorTonnelMint, 32)
        .storeUint(config.relayerTonnelMint, 32)
          .storeCoins(toNano('0.15'))
          .storeCoins(0)
        .endCell()
    ).storeDict(null)
    .storeRef(
      beginCell()
        .storeAddress(config.jettonMinterAddress)
        .storeRef(config.jettonWalletBytecode)
          .storeDict(null)
        .endCell()
  ).endCell();
}

export const Opcodes = {
  deposit: 0x888,
  continue: 0x00,
  withdraw: 0x777,
  changeConfig: 0x999,
  claimFee: 0x222,
  stuck_remove: 0x111
};
// const error::unknown_op = 101;
// const error::access_denied = 102;
// const error::fund = 103;
// const error::verify_failed = 104;
// const error::verify_failed_fee = 105;
// const error::verify_failed_root = 106;
// const error::verify_failed_double_spend = 107;
export const ERRORS = {
  verify_failed_root: 106,
  verify_failed_double_spend: 107,
  unknown_op: 101,
  access_denied: 102,
  fund: 103,
  verify_failed: 104,
  verify_failed_fee: 105,

};

export class TonnelJetton implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromAddress(address: Address) {
    return new TonnelJetton(address);
  }

  static createFromConfig(config: TonnelJettonConfig, code: Cell, workchain = 0) {
    const data = tonnelConfigToCell(config);
    const init = {code, data};
    return new TonnelJetton(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }


  async sendWithdraw(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      queryID?: number;
      a: Cell;
      b: Cell;
      c: Cell;
      root: bigint;
      nullifierHash: bigint;
      recipient: Address;
      fee: bigint;
    }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.withdraw, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeRef(
          beginCell()
            .storeUint(opts.root, 256)
            .storeUint(opts.nullifierHash, 256)
            .storeUint(opts.fee, 10)
            .storeRef(
              beginCell().storeAddress(opts.recipient)
                .endCell()
            ).storeRef(opts.a).storeRef(opts.b)
            .storeRef(opts.c)
            .endCell()
        )
        .endCell(),
    });
  }

  async sendRemoveMinStuck(
      provider: ContractProvider,
      via: Sender,
      opts: {
        value: bigint;
        queryID?: number;
        commitment: bigint;
        newRoot: bigint;
        oldRoot: bigint;
        payload: Cell;
      }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
          .storeUint(Opcodes.stuck_remove, 32)
          .storeUint(opts.queryID ?? 0, 64)
          .storeRef(beginCell().storeUint(opts.commitment, 256).storeUint(
              opts.newRoot, 256
          ).storeUint(
              opts.oldRoot, 256
          ).storeRef(opts.payload).endCell())
          .endCell(),
    });
  }

  async sendChangeFee(
      provider: ContractProvider,
      via: Sender,
      opts: {
        value: bigint;
        queryID?: number;
        ownerAddress: Address;
          tonnelJettonAddress: Address;
          depositorTonnelMint: number;
          relayerTonnelMint: number;
        depositGasFee: bigint;
        newFeePerThousand: number;

      }
    ) {
      await provider.internal(via, {
        value: opts.value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: beginCell()
          .storeUint(Opcodes.changeConfig, 32)
          .storeUint(opts.queryID ?? 0, 64)
            .storeRef(
                beginCell()
                    .storeAddress(opts.ownerAddress)
                    .storeUint(opts.newFeePerThousand, 16)
                    .storeUint(opts.depositorTonnelMint, 32)
                    .storeUint(opts.relayerTonnelMint, 32)
                    .storeCoins(opts.depositGasFee)
                    .endCell()
            )
          .endCell(),
      });
   }

    async sendClaimFee(
        provider: ContractProvider,
        via: Sender,
        opts: {
            value: bigint;
            queryID?: number;
        }
    ) {
        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell()
                .storeUint(Opcodes.claimFee, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .endCell(),
        });
    }


    async getLastRoot(provider: ContractProvider) {
    const result = await provider.get('get_last_root', []);
    return result.stack.readBigNumberOpt();
  }

  async getBalance(provider: ContractProvider) {
    const result = await provider.getState();
    return result.balance;
  }

  async getCheckVerify(provider: ContractProvider, cell: Cell) {
    try {
      const result = await provider.get('check_verify', [
        {type: 'slice', cell: cell} as TupleItemSlice,
      ]);
      console.log(result.stack)
      return result.stack.readNumber();
    } catch (e) {
      return 0;
    }

  }

  async sendChangeConfig(
      provider: ContractProvider,
      via: Sender,
      opts: {
        value: bigint;
        queryID?: number;
        new_fee_per_thousand: number;
        new_tonnel_mint_amount_deposit: number;
        new_tonnel_mint_amount_relayer: number;
      }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
          .storeUint(Opcodes.changeConfig, 32)
          .storeUint(opts.queryID ?? 0, 64)
          .storeUint(opts.new_fee_per_thousand, 10)
          .storeUint(opts.new_tonnel_mint_amount_deposit, 32)
          .storeUint(opts.new_tonnel_mint_amount_relayer, 32)
          .endCell(),
    });
  }
    async getRootKnown(provider: ContractProvider, root: bigint) {
        const result = await provider.get('get_root_known', [
            {type: 'int', value: root},
        ]);
        return result.stack.readNumber();
    }
  async getMinStuck(provider: ContractProvider) {
    const result = await provider.get('get_min_stuck', []);
    console.log(result.stack)
    return result.stack.readBigNumber();
  }


}
