include "../node_modules/circomlib/circuits/mimcsponge.circom";
include "../node_modules/circomlib/circuits/bitify.circom";

template HashLeftRight() {
     signal input left;
        signal input right;
        signal output hash;

        component hasher = MiMCSponge(2, 220, 1);
        hasher.ins[0] <== left;
        hasher.ins[1] <== right;
        hasher.k <== 0;
        hash <== hasher.outs[0];
}

template HashCustom(length) {
    signal input in[length];
    signal output hash;

    component hasher = MiMCSponge(length, 220, 1);
    for (var i = 0; i < length; i++) {
        hasher.ins[i] <== in[i];
    }
    hasher.k <== 0;
    hash <== hasher.outs[0];
}


template HashThree() {
     signal input inputs[3];
        signal output out;
       component hasher = MiMCSponge(3, 220, 1);
        hasher.ins[0] <== inputs[0];
        hasher.ins[1] <== inputs[1];
        hasher.ins[2] <== inputs[2];
        hasher.k <== 0;
        out <== hasher.outs[0];
}


// if s == 0 returns [in[0], in[1]]
// if s == 1 returns [in[1], in[0]]
template Selector() {
	signal input in[2];
	signal input indice;
	signal output outs[2];

	indice * (1 - indice) === 0; // constrain s equal to 0 or 1
	outs[0] <== (in[1] - in[0]) * indice + in[0];
	outs[1] <== (in[0] - in[1]) * indice + in[1];
}

template MerkleTreeCheck(levels) {
	signal input leaf;
	signal output root;
	signal input pathElements[levels];
	signal input pathIndices[levels];

	component hashers[levels];
	component selectors[levels];

	for (var i = 0; i < levels; i++) {
		selectors[i] = Selector();
		selectors[i].in[0] <== i == 0 ? leaf : hashers[i - 1].hash;
		selectors[i].in[1] <== pathElements[i];
		selectors[i].indice <== pathIndices[i];

		hashers[i] = HashLeftRight();
		hashers[i].left <== selectors[i].outs[0];
		hashers[i].right <== selectors[i].outs[1];
	}

	root <== hashers[levels - 1].hash;
}


template RawMerkleTree(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    signal output root;

    component selectors[levels];
    component hashers[levels];

    for (var i = 0; i < levels; i++) {
        selectors[i] = Selector();
        selectors[i].in[0] <== i == 0 ? leaf : hashers[i - 1].hash;
        selectors[i].in[1] <== pathElements[i];
        selectors[i].indice <== pathIndices[i];

        hashers[i] = HashLeftRight();
        hashers[i].left <== selectors[i].outs[0];
        hashers[i].right <== selectors[i].outs[1];
    }

    root <== hashers[levels - 1].hash;
}


template MerkleTreeUpdater(levels, zeroLeaf) {
    signal input oldRoot;
    signal input newRoot;
    signal input leaf;
    signal input pathIndices;
    signal private input pathElements[levels];

    // Compute indexBits once for both trees
    // Since Num2Bits is non deterministic, 2 duplicate calls to it cannot be
    // optimized by circom compiler
    component indexBits = Num2Bits(levels);
    indexBits.in <== pathIndices;

    component treeBefore = RawMerkleTree(levels);
    for(var i = 0; i < levels; i++) {
        treeBefore.pathIndices[i] <== indexBits.out[i];
        treeBefore.pathElements[i] <== pathElements[i];
    }
    treeBefore.leaf <== zeroLeaf;
    treeBefore.root === oldRoot;

    component treeAfter = RawMerkleTree(levels);
    for(var i = 0; i < levels; i++) {
        treeAfter.pathIndices[i] <== indexBits.out[i];
        treeAfter.pathElements[i] <== pathElements[i];
    }
    treeAfter.leaf <== leaf;
    treeAfter.root === newRoot;
}

