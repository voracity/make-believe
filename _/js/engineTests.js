var tests = {
	async perfTestEvidence_12nodegrid(bn) {
		dbg.off;
		/// Assume loaded
		let perfIters = 20;
		bn.setEvidence({E4:0});
		let p;
		let stats = new Stats();
		for (let i=0; i<perfIters; i++) {
			p = performance.now();
			//console.info(i);
			await new Promise(r => bn.updateBeliefs(r));
			stats.add(performance.now() - p);
		}
		console.info('E4:0:', stats.str());
		bn.setEvidence({E4:null});
		stats = new Stats();
		for (let i=0; i<perfIters; i++) {
			p = performance.now();
			//console.info(i);
			await new Promise(r => bn.updateBeliefs(r));
			stats.add(performance.now() - p);
		}
		console.info('E4:null:', stats.str());
		bn.setEvidence({C2:0});
		stats = new Stats();
		for (let i=0; i<perfIters; i++) {
			p = performance.now();
			//console.info(i);
			await new Promise(r => bn.updateBeliefs(r));
			stats.add(performance.now() - p);
		}
		console.info('C2:0:', stats.str());
		dbg.on;
	},
	
	check_marginalize() {
		let f = new Factor(); f.make(['a','b','c'], [2,1,2], [0.03,0.04,0.05,.14], null, [null,[1],null])
		console.log(f.toString());
		console.log(f.marginalize1('a').toString());
		console.log(f.marginalize3('a').toString());
		let f2 = Factor.makeTestFactor(5)
		console.log(f2.toString());
		console.log(f2.marginalize1('E').toString());
		console.log(f2.marginalize3(['E']).toString());
		console.log(f2.marginalize1('E').marginalize1('C').toString());
		console.log(f2.marginalize3(['E','C']).toString());
	},
	
	perf_marginalize() {
		dbg.off;
		let iters = 10000;
		let f = Factor.makeTestFactor(6);
		// f.marginalize1('C');
		// f.marginalize2('C');
		// return;
		console.log('Single');
		let res = {marginalize1: new Stats(), marginalize2: new Stats()};
		let arr = ['A'];
		for (let i=0; i<iters; i++) {
			if (Math.random()<0.5) {
				p = performance.now();
				f.marginalize1('A');
				res.marginalize1.add(performance.now()-p);
			}
			else {
				p = performance.now();
				f.marginalize2(arr);
				res.marginalize2.add(performance.now()-p);
			}
		}
		for (let [method,perf] of Object.entries(res)) {
			console.info(method, perf.str());
		}
		console.log('Multiple');
		f = Factor.makeTestFactor(10);
		res = {marginalize1: new Stats(), marginalize2: new Stats(), m2: new Stats()};
		arr = ['C'];
		let t = 0;
		let x = null;
		for (let i=0; i<iters; i++) {
			if (Math.random()<0.5) {
				p = performance.now();
				f.marginalize3(['A','B','C','D','E','F','G','H','I']);
				// x = new Function('f', 'for (let i=0; i<'+i+'; i++) console.log(i)');
				res.marginalize2.add(performance.now()-p);
				// res.m2.add(t);
			}
			else {
				p = performance.now();
				f.marginalize1('A').marginalize1('B').marginalize1('C').marginalize1('D').marginalize1('E').marginalize1('F').marginalize1('G').marginalize1('H').marginalize1('I');
				res.marginalize1.add(performance.now()-p);
			}
		}
		for (let [method,perf] of Object.entries(res)) {
			console.info(method, perf.str());
		}
		dbg.on;
	},

	check_factorEquality() {
		let f = Factor.makeTestFactor(3);
		let f2 = Factor.makeTestFactor(3);
		console.log(f.equals(f2));
		f2.vars[0] = 'a';
		console.log(f.equals(f2));
		f2.vars[0] = 'B';
		f2.vars[1] = 'A';
		console.log(f.equals(f2));
		f2.vars[0] = 'A';
		f2.vars[1] = 'B';
		console.log(f.equals(f2));
		f3 = f2.select({A:1});
		console.log(f.equals(f3));
		t1 = new Factor(); t1.make(['A'],[1],[1],null,[[1]]);
		f4 = f.multiplyFaster4(t1);
		console.log(f3.equals(f4));
	},
};

if (typeof(exports)!="undefined") {
	exports.tests = tests;
}