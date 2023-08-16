include "../merkleTree.circom";


template RevealNFT(levels) {
    signal input id;
    signal input address;
    signal input root;
    signal private input secret;
    signal private input pathElements[levels];
    signal private input pathIndices[levels];
    signal output nullifier;

    component commitmentHasher = HashLeftRight();
    commitmentHasher.left <== id;
    commitmentHasher.right <== secret;


    component tree = MerkleTreeCheck(levels);
    tree.leaf <== commitmentHasher.hash;
    tree.root <== root;

    for (var i = 0; i < levels; i++) {
          tree.pathElements[i] <== pathElements[i];
          tree.pathIndices[i] <== pathIndices[i];
    }

    component nullifierHasher = HashLeftRight();
    nullifierHasher.left <== secret;
    nullifierHasher.right <== id;
    nullifier <== nullifierHasher.hash;
}


component main = RevealNFT(20);