/// XXX: Even with Math.random(), this should work reasonably well
function int32Random() {
	return Math.floor(Math.random()*0xffffffff);
}

/// XXX: Replace with something that does [0,1] (and not [0,1)]
function unitRandom() {
	return Math.random();
}

function Bernoulli(p) {
	return unitRandom()<p;
}

function Uniform(a,b) {
	return unitRandom()*(b-a) + a;
}

function Normal(mean, sd) {
	var s = 0;
	for (var i=0; i<12; i++)  s += Math.random();
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
