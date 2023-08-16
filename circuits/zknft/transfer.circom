
include "../merkleTree.circom";

template TransferNFT(levels) {
    signal private input id;
    signal input root;

    signal private input secret;
    signal private input newSecret;
    signal private input pathElements[levels];
    signal private input pathIndices[levels];

    signal output nullifier;
    signal output newCommitment;

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


    component newCommitmentHasher = HashLeftRight();
    newCommitmentHasher.left <== id;
    newCommitmentHasher.right <== newSecret;
    newCommitment <== newCommitmentHasher.hash;

    component nullifierHasher = HashLeftRight();
    nullifierHasher.left <== secret;
    nullifierHasher.right <== id;
    nullifier <== nullifierHasher.hash;
}


component main = TransferNFT(20);