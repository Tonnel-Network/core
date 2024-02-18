import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider, fromNano,
  Sender,
  SendMode, TupleReader
} from 'ton-core';

export type StakeConfig = {
  jettonMinterAddress: Address;
  jettonWalletBytecode: Cell;
  admin: Address;
};

export function tonnelConfigToCell(config: StakeConfig): Cell {

  return beginCell().storeDict(null).storeRef(beginCell().storeAddress(config.jettonMinterAddress).storeRef(config.jettonWalletBytecode).endCell()).storeRef(beginCell().storeAddress(config.admin).endCell()).endCell();
}
export const Opcodes = {
  stake_TON: 777,
  stake_TONNEL: 778,
  withdraw_TON: 779,
  withdraw_TONNEL: 780,
  claim_TONNEL: 781,
};
// const error::not_staked = 700;
// const error::not_enough = 701;
export const ERRORS = {
  not_staked: 700,
  not_enough: 701

};

export class Stake implements Contract {
  constructor(readonly address: Address, readonly init?: { code: Cell; data: Cell }) {
  }

  static createFromAddress(address: Address) {
    return new Stake(address);
  }

  static createFromConfig(config: StakeConfig, code: Cell, workchain = 0) {
    const data = tonnelConfigToCell(config);
    const init = {code, data};
    return new Stake(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendStakeTON(
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
        .storeUint(Opcodes.stake_TON, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .endCell(),
    });
  }

  async sendWithdrawTON(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      queryID?: number;
      amount: bigint;
    }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.withdraw_TON, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeCoins(opts.amount)
        .endCell(),
    });
  }
  async sendWithdrawTONNEL(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      queryID?: number;
      amount: bigint;
      creed_id?: number;
    }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.withdraw_TONNEL, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeCoins(opts.amount)
        .storeUint(opts.creed_id || 0, 64)
        .endCell(),
    });
  }

  async sendClaimTonnel(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      queryID?: number;
      amount: bigint;
    }
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell()
        .storeUint(Opcodes.claim_TONNEL, 32)
        .storeUint(opts.queryID ?? 0, 64)
        .storeCoins(opts.amount)
        .endCell(),
    });
  }

  async getBalance(provider: ContractProvider) {
    const result = await provider.getState();
    return result.balance;
  }

  async getUserState(provider: ContractProvider, address: Address, creeds: number[]) {
    const result = await provider.get('get_user_state', [
      {type: 'slice',
        cell: beginCell().storeAddress(address).endCell()
      },
      {type: 'tuple',
        items: creeds.map((item) => {
          return {
            type: 'int',
                value: BigInt(item)
          }
        })
      }
    ]);
    const tuple = result.stack.readTuple();
    let res = [];
    for (var i = 0; i < creeds.length; i++) {
      const temp = tuple.pop();

      if (temp.type == 'int') {
        res.push(fromNano(temp.value));
      }

    }

    console.log(res)
    return res;
  }

}
