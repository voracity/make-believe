/// XXX: Even with Math.random(), this should work reasonably well
function int32Random() {
	return Math.floor(Math.random()*0xffffffff);
}

/*var nums = new Float32Array(new ArrayBuffer(4e6));
var numI = -1;
for (var i=0; i<nums.length; i++) {
	nums[i] = Math.random();
}*/

/// XXX: Replace with something that does [0,1] (and not [0,1)]
function unitRandom() {
	return Math.random();
	//return nums[++numI >= 1e6 ? (numI = 0) : numI];
}

function Bernoulli(p) {
	return unitRandom()<p;
}

/// Minorly adapted from http://stackoverflow.com/questions/23561551/a-efficient-binomial-random-number-generator-code-in-java
/// Need to replace or supplement with fast-binomial-generation-p216-kachitvichyanukul.pdf
/// Speed is proportional to n*min(p,1-p), while there are algorithms which are uniformly fast (i.e. constant time)
/// This only works properly with integral n (GeNIe's Binomial works - oddly, but intuitively - with real n)
function Binomial(n, p) {
	if (p < 0.5) {
		var log_q = Math.log(1.0 - p);
		var x = 0;
		var sum = 0;
		while (true) {
			sum += Math.log(unitRandom()) / (n - x);
			if(sum < log_q) {
				return x;
			}
			x++;
		}
	}
	else {
		var log_p = Math.log(p);
		var x = 0;
		var sum = 0;
		while (true) {
			sum += Math.log(unitRandom()) / (n - x);
			if(sum < log_p) {
				return n - x;
			}
			x++;
		}
	}
}

function Uniform(a,b) {
	return unitRandom()*(b-a) + a;
}

function Normal(mean, sd) {
	//return unitRandom()-0.5;
	var s = 0;
	for (var i=0; i<12; i++)  s += unitRandom();
	s -= 6;

	return (s*sd) + mean;
}

/// Simple bin discretizer
function generateMultinomialFromSamples(samples, numBins) {
	var min = Math.min.apply(null, samples);
	var max = Math.max.apply(null, samples);
	var binSize = (max-min)/numBins;
	var discInfo = {bins: newArray(numBins, 0), boundaries: newArray(numBins+1,0)};
	discInfo.boundaries[0] = min;
	discInfo.boundaries[numBins] = max;
	for (var i=0; i<samples.length; i++) {
		var binI = Math.floor((samples[i]-min)/binSize);
		/// [a,b),[b,c),[c,d] <-- to do last (inclusive upper), we need to check if we get d
		binI = binI<numBins ? binI : numBins-1;
		discInfo.bins[binI]++;
		discInfo.boundaries[binI+1] = min + ((binI+1)*binSize);


	}

	for (var i=0; i<discInfo.bins.length; i++) {
		discInfo.bins[i] /= samples.length;
	}
	return discInfo;
}
