import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode, toNano
} from 'ton-core';
import {TupleItemSlice} from "ton-core/dist/tuple/tuple";

export type TonnelJettonConfig = {
  ownerAddress: Address;
  jettonMinterAddress: Address;
  jettonWalletBytecode: Cell;
  tonnelJettonAddress: Address;
  depositorTonnelMint: number;
  relayerTonnelMint: number;
};

export function tonnelConfigToCell(config: TonnelJettonConfig): Cell {

  return beginCell().storeUint(0, 8)
    .storeRef(beginCell().endCell())
    .storeRef(
      beginCell()
        .storeAddress(config.ownerAddress)
        .storeUint(20, 10)
        .storeAddress(config.tonnelJettonAddress)
        .storeUint(config.depositorTonnelMint, 32)
        .storeUint(config.relayerTonnelMint, 32)
        .storeCoins(toNano('1.6'))
        .storeCoins(toNano('0.8'))
        .endCell()
    ).storeDict(null)
    .storeRef(
      beginCell()
        .storeAddress(config.jettonMinterAddress)
        .storeRef(config.jettonWalletBytecode)
        .endCell()
  ).endCell();
}

export const Opcodes = {
  deposit: 0x888,
  continue: 0x00,
  withdraw: 0x777,
  changeFee: 0x999
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

  async sendDeposit(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      queryID?: number;
      commitment: bigint;
    }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.deposit, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeRef(beginCell().storeUint(opts.commitment, 256).endCell())
        .endCell(),
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
      fee: number;
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

  async sendContinue(
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
        .storeUint(Opcodes.continue, 32)
        .storeUint(opts.queryID ?? 0, 64).storeAddress(via.address)
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
      }
    ) {
      await provider.internal(via, {
        value: opts.value,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        body: beginCell()
          .storeUint(Opcodes.changeFee, 32)
          .storeUint(opts.queryID ?? 0, 64)
            .storeRef(
                beginCell()
                    .storeAddress(opts.ownerAddress)
                    .storeUint(20, 10)
                    .storeAddress(opts.tonnelJettonAddress)
                    .storeUint(opts.depositorTonnelMint, 32)
                    .storeUint(opts.relayerTonnelMint, 32)
                    .storeCoins(toNano('1.6'))
                    .storeCoins(toNano('0.8'))
                    .endCell()
            )
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

}
