include "../node_modules/circomlib/circuits/sha256/sha256.circom";


template Bits2Num(n) {
    signal input in[n];
    signal output out;
    var lc1=0;

    var e2 = 1;
    for (var i = 0; i<n; i++) {
        lc1 += in[i] * e2;
        e2 = e2 + e2;
    }

    lc1 ==> out;
}

template Num2Bits(n) {
    signal input in;
    signal output out[n];
    var lc1=0;

    var e2=1;
    for (var i = 0; i<n; i++) {
        out[i] <-- (in >> i) & 1;
        out[i] * (out[i] -1 ) === 0;
        lc1 += out[i] * e2;
        e2 = e2+e2;
    }

    lc1 === in;
}

template Sha256Hasher(length) {
    var inBits = 256 * length;

    signal input in[length];
    signal output hash;

    component n2b[length];
    for (var i = 0; i < length; i++) {
        n2b[i] = Num2Bits(256);
        n2b[i].in <== in[i];
    }

    component sha = Sha256(inBits);
    for (var i = 0; i < length; i ++) {
        for (var j = 0; j < 256; j ++) {
            sha.in[(i * 256) + 255 - j] <== n2b[i].out[j];
        }
    }

    component shaOut = Bits2Num(256);
    for (var i = 0; i < 256; i++) {
        shaOut.in[i] <== sha.out[255-i];
    }
    hash <== shaOut.out;
}

template Sha256HashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;

    component hasher = Sha256Hasher(2);
    hasher.in[0] <== left;
    hasher.in[1] <== right;
    hash <== hasher.hash;
}

template HashLeftRight() {
    signal input left;
    signal input right;
    signal output hash;

    component hasher = Sha256HashLeftRight()
    hasher.left <== left;
    hasher.right <== right;

    hash <== hasher.hash;
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
	signal input root;
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

	root === hashers[levels - 1].hash;
}

