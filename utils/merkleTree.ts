import { ethers } from "ethers";
// @ts-ignore
import mimcsponge from "../utils/mimcsponge";
export  function bitsToNumber(bits: any[]) {
  let result = 0
  for (const item of bits.slice().reverse()) {
    result = (result << 1) + item
  }
  return result
}

export function Sha256(left: string, right: string): string {
  // const outputJS = sha256Hash([BigInt(left), BigInt(right)])
  // // console.log(outputJS.toString(16),left,right)
  // return outputJS.toString();
  return mimcsponge.multiHash([BigInt(left), BigInt(right)]).toString();
  // return left;

}
export const mimcHash = (items: any[]) =>
    (mimcsponge.multiHash(items.map((item) => BigInt(item))).toString())

export const mimcHash2 = (a: any, b: any) =>
    (mimcsponge.multiHash([BigInt(a), BigInt(b)]).toString())


export interface IMerkleTree {
  root: () => string;
  proof: (index: number) => {
    root: string;
    pathElements: string[];
    pathIndices: number[];
    leaf: string;
  };
  insert: (leaf: string) => void;
}

export class MerkleTree implements IMerkleTree {
  readonly zeroValue = "21663839004416932945382355908790599225266501822907911457504978515578255421292";

  levels: number;
  hashLeftRight: (left: string, right: string) => string;
  storage: Map<string, string>;
  zeros: string[];
  totalLeaves: number;

  constructor(levels: number, defaultLeaves: string[] = [], hashLeftRight = Sha256) {
    this.levels = levels;
    this.hashLeftRight = hashLeftRight;
    this.storage = new Map();
    this.zeros = [];
    this.totalLeaves = 0;

    // build zeros depends on tree levels
    let currentZero = this.zeroValue;
    this.zeros.push(currentZero);
    for (let i = 0; i < levels; i++) {
      currentZero = this.hashLeftRight(currentZero, currentZero);
      this.zeros.push(currentZero);
    }

    if (defaultLeaves.length > 0) {
      this.totalLeaves = defaultLeaves.length;

      // store leaves with key value pair
      let level = 0;
      defaultLeaves.forEach((leaf, index) => {
        this.storage.set(MerkleTree.indexToKey(level, index), leaf);
      });

      // build tree with initial leaves
      level++;
      let numberOfNodesInLevel = Math.ceil(this.totalLeaves / 2);
      for (level; level <= this.levels; level++) {
        for (let i = 0; i < numberOfNodesInLevel; i++) {
          const leftKey = MerkleTree.indexToKey(level - 1, 2 * i);
          const rightKey = MerkleTree.indexToKey(level - 1, 2 * i + 1);

          const left = this.storage.get(leftKey);
          const right = this.storage.get(rightKey) || this.zeros[level - 1];
          if (!left) throw new Error("leftKey not found");

          const node = this.hashLeftRight(left, right);
          this.storage.set(MerkleTree.indexToKey(level, i), node);
        }
        numberOfNodesInLevel = Math.ceil(numberOfNodesInLevel / 2);
      }
    }
  }

  static indexToKey(level: number, index: number): string {
    return `${level}-${index}`;
  }

  getIndex(leaf: string): number {
    for (const [key, value] of this.storage) {
      if (value === leaf) {
        return Number(key.split("-")[1]);
      }
    }
    return -1;
  }

  root(): string {
    return this.storage.get(MerkleTree.indexToKey(this.levels, 0)) || this.zeros[this.levels];
  }

  proof(indexOfLeaf: number) {
    let pathElements: string[] = [];
    let pathIndices: number[] = [];

    const leaf = this.storage.get(MerkleTree.indexToKey(0, indexOfLeaf));
    if (!leaf) throw new Error("leaf not found");

    // store sibling into pathElements and target's indices into pathIndices
    const handleIndex = (level: number, currentIndex: number, siblingIndex: number) => {
      const siblingValue = this.storage.get(MerkleTree.indexToKey(level, siblingIndex)) || this.zeros[level];
      pathElements.push(siblingValue);
      pathIndices.push(currentIndex % 2);
    };

    this.traverse(indexOfLeaf, handleIndex);

    return {
      root: this.root(),
      pathElements,
      pathIndices,
      leaf: leaf,
    };
  }

  insert(leaf: string) {
    const index = this.totalLeaves;
    this.update(index, leaf, true);
    this.totalLeaves++;
  }

  update(index: number, newLeaf: string, isInsert: boolean = false) {
    if (!isInsert && index >= this.totalLeaves) {
      throw Error("Use insert method for new elements.");
    } else if (isInsert && index < this.totalLeaves) {
      throw Error("Use update method for existing elements.");
    }

    let keyValueToStore: { key: string; value: string }[] = [];
    let currentElement: string = newLeaf;

    const handleIndex = (level: number, currentIndex: number, siblingIndex: number) => {
      const siblingElement = this.storage.get(MerkleTree.indexToKey(level, siblingIndex)) || this.zeros[level];

      let left: string;
      let right: string;
      if (currentIndex % 2 === 0) {
        left = currentElement;
        right = siblingElement;
      } else {
        left = siblingElement;
        right = currentElement;
      }

      keyValueToStore.push({
        key: MerkleTree.indexToKey(level, currentIndex),
        value: currentElement,
      });
      currentElement = this.hashLeftRight(left, right);
      // console.log(currentElement, left, right );
    };

    this.traverse(index, handleIndex);

    // push root to the end
    keyValueToStore.push({
      key: MerkleTree.indexToKey(this.levels, 0),
      value: currentElement,
    });

    keyValueToStore.forEach(o => {
      this.storage.set(o.key, o.value);
    });
  }

  // traverse from leaf to root with handler for target node and sibling node
  private traverse(indexOfLeaf: number, handler: (level: number, currentIndex: number, siblingIndex: number) => void) {
    let currentIndex = indexOfLeaf;
    for (let i = 0; i < this.levels; i++) {
      let siblingIndex;
      if (currentIndex % 2 === 0) {
        siblingIndex = currentIndex + 1;
      } else {
        siblingIndex = currentIndex - 1;
      }

      handler(i, currentIndex, siblingIndex);
      currentIndex = Math.floor(currentIndex / 2);
    }
  }
}
