/**

The functions here aim for compatibility with GeNIe. I expect to have more functions
than GeNIe (currently) has, but all of GeNIe's current functions should eventually be here
and operate in a compatible way.

**/
var EquationFunctions = {

	/// XXX: Even with Math.random(), this should work reasonably well
	int32Random() {
		return Math.floor(Math.random()*0xffffffff);
	},

	/*var nums = new Float32Array(new ArrayBuffer(4e6));
	var numI = -1;
	for (var i=0; i<nums.length; i++) {
		nums[i] = Math.random();
	}*/

	/// XXX: Replace with something that does [0,1] (and not [0,1))
	unitRandom() {
		return Math.random();
		//return nums[++numI >= 1e6 ? (numI = 0) : numI];
	},

	/**
	A single event with exactly two outcomes. |p| specifies the probability
	of the first outcome, and 1-|p| the second.
	*/
	Bernoulli(p) {
		return unitRandom()<p;
	},

	/// Minorly adapted from http://stackoverflow.com/questions/23561551/a-efficient-binomial-random-number-generator-code-in-java
	/// Need to replace or supplement with fast-binomial-generation-p216-kachitvichyanukul.pdf
	/// Speed is proportional to n*min(p,1-p), while there are algorithms which are uniformly fast (i.e. constant time)
	/// This only works properly with integral n (GeNIe's Binomial works - oddly, but intuitively - with
	/// real n. Update 2016-10-03: Actually, no it doesn't! To my consternation, this caused a fairly big bug in a project. )
	Binomial(n, p) {
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
	},

	/**
	Generates a random real number between [a,b).
	XXX: Once unitRandom() fixed, will be [a,b].
	*/
	Uniform(a,b) {
		return unitRandom()*(b-a) + a;
	},

	/// This is both a crude and slow approximation. It will be replaced.
	NormalCrude(mean, sd) {
		//return unitRandom()-0.5;
		var s = 0;
		for (var i=0; i<12; i++)  s += unitRandom();
		s -= 6;

		return (s*sd) + mean;
	},

	//https://en.wikipedia.org/wiki/Normal_distribution#Numerical_approximations_for_the_normal_CDF
	//XXX: Note, still untested
	normalCdf(x) {
		var cdfOfX = (1 + Math.sign(x)*Math.sqrt( 1 - Math.exp(-2*x*x/Math.PI) ))/2;
		return cdfOfX;
	},

	// From Wichura, M.J. (1988). "Algorithm AS241: The Percentage Points of the Normal Distribution". Applied Statistics.
	invNormalCdf(p) {
		const a0 = 2.50662823884  ;
		const a1 = -18.61500062529;
		const a2 = 41.39119773534 ;
		const a3 = -25.44106049637;
		const b1 = -8.47351093090 ;
		const b2 = 23.08336743743 ;
		const b3 = -21.06224101826;
		const b4 = 3.13082909833  ;
		const c0 = -2.78718931138 ;
		const c1 = -2.29796479134 ;
		const c2 = 4.85014127135  ;
		const c3 = 2.32121276858  ;
		const d1 = 3.54388924762  ;
		const d2 = 1.63706781897  ;

		const split = 0.42;

		// check sum
		//onsole.log([a0,a1,a2,a3,b1,b2,b3,b4].map(Math.abs).reduce((a,b)=>a+b));
		//onsole.log([c0,c1,c2,c3,d1,d2].map(Math.abs).reduce((a,b)=>a+b));

		var q = p - 0.5;
		var val = 0;
		if (Math.abs(q) <= split) {
			var r = q*q;
			val = q * (((a3 * r + a2) * r + a1) * r + a0)
				/ ((((b4 * r + b3) * r + b2) * r + b1) * r + 1);
		}
		else {
			var r = p;
			if (q > 0)  r = 1 - p;
			if (r < 0)  throw new Exception("Invalid calculation of r. (Invalid p?)");
			r = Math.sqrt(-Math.log(r));
			val = (((c3 * r + c2) * r + c1) * r + c0)
				/ ((d2 * r + d1) * r + 1);
			if (q < 0)  val = -val;
		}
		
		return val;
	},

	Normal(mean, sd) {
		return invNormalCdf(unitRandom())*sd + mean;
	},

	/// NoisyOr(probChildTrue1, ifParent1True, probChildTrue2, ifParent2True, ..., leakProb)
	NoisyOr(...args) {
		//onsole.log(args);
		let product = 1;
		for (let i=0; i<args.length-1; i+=2) {
			product *= (1-args[i]*args[i+1]);
		}
		if (args.length % 2 !=0) {
			product *= (1-args[args.length-1]);
		}
		//onsole.log(1-product);
		return Bernoulli(1-product);
		//return 1-product;
	},

	/// NoisyOr(childDistribution1, [ifParent1True], probChildTrue2, ifParent2True, ..., leakProb)
	/// To be done!
	/// Here are the preferred syntaxes:
	/// 	NoisyMax(Parent1, [[0.2,0.5,0.3],[0.4,0.4,0.2],[0.1,0.5,0.4]], Parent2, ...)
	/// 	NoisyMax(Parent1, {"High": [0.2,"r",0.3], "Medium": [0.1,0.3,"r"], "Low": ["5r","2r","r"]}, Parent2, ...)
	/// The "r" means remainder, and acts like CSS flexes (i.e. fr units).
	NoisyMax(...args) {
		//onsole.log(args);
		/*let product = 1;
		for (let i=0; i<args.length-1; i+=2) {
			product *= (1-args[i]*args[i+1]);
		}
		if (args.length % 2 !=0) {
			product *= (1-args[args.length-1]);
		}
		//onsole.log(1-product);
		return Bernoulli(1-product);*/
		//return 1-product;
		return 0;
	},

	NoisyAnd(...args) {
		//onsole.log(args);
		let product = 1;
		for (let i=0; i<args.length-1; i+=2) {
			product *= (args[i]*args[i+1]);
		}
		if (args.length % 2 !=0) {
			product *= (args[args.length-1]);
		}
		//onsole.log(1-product);
		return Bernoulli(product);
		//return 1-product;
	},

	//////////////////////////
	/// Arithmetic functions
	//////////////////////////
	Abs(v) {
		return Math.abs(v);
	},

	Exp(v) {
		return Math.exp(v);
	},

	Gammaln(v) {

	},

	GCD(n, k) {

	},

	LCM(n, k) {

	},

	Ln(v) {
		return Math.log(v);
	},

	Log(v, b) {
		return Math.log(v)/Math.log(b);
	},

	Log10(v) {
		return Math.log10(v);
	},

	Pow10(v) {
		return Math.pow(10,v);
	},

	Round(v) {
		return Math.round(v);
	},

	Sign(v) {
		return Math.sign(v);
	},

	Sqr(v) {
		return v*v;
	},

	Sqrt(v) {
		return Math.sqrt(v);
	},

	/// Not sure why GeNIe includes this...
	SqrtPi(v) {
		return Math.sqrt(Math.PI*v);
	},

	Sum() {
		var s = 0;
		for (var i=0; i<arguments.length; i++) {
			s += arguments[i];
		}
		return s;
	},

	SumSq() {
		var s = 0;
		for (var i=0; i<arguments.length; i++) {
			s += arguments[i]*arguments[i];
		}
		return s;
	},

	Trim(v, lo, hi) {
		return Math.min(Math.max(v, lo), hi);
	},

	Truncate(v) {
		return v < 0 ? Math.ceil(v) : Math.floor(v);
	},

	///////////////////////
	/// Logical operators
	///////////////////////
	And() {
		var res = true;
		for (var i=0; i<arguments.length; i++) {
			res = res && arguments[i];
		}
		return res ? 1 : 0;
	},

	Or() {
		var res = false;
		for (var i=0; i<arguments.length; i++) {
			res = res || arguments[i];
		}
		return res ? 1 : 0;
	},
	
	Not(arg) {
		return !arg;
	},

	Xor() {
		var res = 0;
		for (var i=0; i<arguments.length; i++) {
			res = res ^ (arguments[i] ? 1 : 0);
		}
		return res;
	},

	Max() {
		return Math.max.apply(null, arguments);
	},

	Min() {
		return Math.min.apply(null, arguments);
	},

	If(cond, then, els) {
		return cond ? then : els;
	},

	Switch(index) {
		return arguments[index+1];
	},

	/// Simple bin discretizer
	generateMultinomialFromSamples(samples, numBins) {
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
	},
}

/// Export every function globally
/// (Will remove this in future)
for (let name in EquationFunctions) {
	//if (name.search(/^[A-Z]/)!=-1) {
		globalThis[name] = EquationFunctions[name];
	//}
}

/// To export equation function names to CodeFlask (whenever they change):
///   Object.keys(EquationFunctions).filter(n => n.search(/^[A-Z]/)!=-1).join('|')