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
	
	async generalPerfTest(arms, configs, mbConfig, iters = 10) {
		dbg.withOff(async _=>{
			let origConfig = JSON.stringify(mbConfig);
			
			let res = Object.fromEntries(arms.map(arm => [arm.name,
				Object.fromEntries(Object.keys(configs).map(k => [k, new Stats()]))
			]));
			
			for (let i=0; i<iters; i++) {
				process.stdout.write(i+(i!=iters-1?',':''));
				for (let arm of arms) {
					for (let [k,config] of Object.entries(configs)) {
						let retT;
						let t = performance.now();
						retT = await arm.run(mbConfig, config);
						res[arm.name][k].add(retT != null ? retT : performance.now() - t);
					}
				}
			}
			
			Object.assign(mbConfig, JSON.parse(origConfig));
			
			console.info(transformObject(res, v => v instanceof Stats ? v.str() : v));
			
			return res;
		});
	},
	
	async perf_jtreeVariableElimination(bns, mbConfig) {
		let evNodes = new Map([[bns['12node'],'E4'],[bns['watershort'],'E4'],[bns['covid_omi'],'st']]);
		let makeNoEv = (schoice,tchoice) => {
			return {name:'No evidence - '+schoice+' - '+tchoice, async run(m,bn) {
				m.jtree.simplicialChoice = schoice;
				m.jtree.triangulationChoice = tchoice;
				await bn.compile(true);
				let t = performance.now();
				await new Promise(r => bn.updateBeliefs(r));
				return performance.now()-t;
			}};
		};
		let makeEv = (schoice,tchoice) => {
			return {name:'Evidence on leaf - '+schoice+' - '+tchoice, async run(m,bn) {
				m.jtree.simplicialChoice = schoice;
				m.jtree.triangulationChoice = tchoice;
				await bn.compile(true);
				let id = evNodes.get(bn);
				bn.setEvidence({[id]:0});
				let t = performance.now();
				await new Promise(r => bn.updateBeliefs(r));
				bn.clearEvidence();
				return performance.now()-t;
			}};
		};
		let scs = ['arbitrary','minDegree','maxDegree'];
		let tcs = ['minDegree','minDegreeRemaining','minFill'];
		this.generalPerfTest([
			scs.map(sc => tcs.map(tc => makeNoEv(sc, tc))),
			scs.map(sc => tcs.map(tc => makeEv(sc, tc))),
		].flat().flat(), bns, mbConfig, 100);
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
		{
			console.log('Single');
			let f = Factor.makeTestFactor(10);
			let res = {marginalize1: new Stats(), marginalize1a: new Stats(), m1a: new Stats()};
			let t = 0;
			for (let i=0; i<iters; i++) {
				if (Math.random()<0.5) {
					p = performance.now();
					f.marginalize1('A');
					res.marginalize1.add(performance.now()-p);
				}
				else {
					p = performance.now();
					t = f.marginalize1a('A');
					// console.info(t);
					res.marginalize1a.add(performance.now()-p);
					res.m1a.add(t);
				}
			}
			for (let [method,perf] of Object.entries(res)) {
				console.info(method, perf.str());
			}
		}
		dbg.on;
	},

	perf_multiply() {
		dbg.off;
		let iters = 1000;
		{
			console.log('Single');
			let f = Factor.makeTestFactor(6);
			let f2 = Factor.makeTestFactor(6);
			f2.vars = ['D','E','F','G','H','I'];
			let res = {multiplyFaster4: new Stats(), multiplyFaster4a: new Stats()};
			let t = 0;
			for (let i=0; i<iters; i++) {
				if (Math.random()<0.5) {
					p = performance.now();
					f.multiplyFaster4(f2);
					res.multiplyFaster4.add(performance.now()-p);
				}
				else {
					p = performance.now();
					f.multiplyFaster4a(f2);
					// console.info(t);
					res.multiplyFaster4a.add(performance.now()-p);
				}
			}
			for (let [method,perf] of Object.entries(res)) {
				console.info(method, perf.str());
			}
			return res;
		}
		dbg.on;
	},
	
	perf_marginalizeToSingle() {
		dbg.off;
		let iters = 10000;
		{
			let f = Factor.makeTestFactor(5);
			let res = {marginalize1: new Stats(), marginalizeToSingle: new Stats()};
			let t = 0;
			for (let i=0; i<iters; i++) {
				if (Math.random()<0.5) {
					p = performance.now();
					f.marginalize1('A').marginalize1('B').marginalize1('C').marginalize1('E');
					res.marginalize1.add(performance.now()-p);
				}
				else {
					p = performance.now();
					f.marginalizeToSingle('D');
					res.marginalizeToSingle.add(performance.now()-p);
				}
			}
			for (let [method,perf] of Object.entries(res)) {
				console.info(method, perf.str());
			}
			return res;
		}
		dbg.on;
	},
	
	compare(method, iters = 100) {
		let winners;
		for (let i=0; i<iters; i++) {
			let res = method();
			winners ??= Object.fromEntries(Object.keys(res).map(k=>[k,0]));
			let minMean = Infinity;
			let minMethod = null;
			for (let [method,perf] of Object.entries(res)) {
				if (perf.mean()<minMean) {
					minMean = perf.mean();
					minMethod = method;
				}
			}
			winners[minMethod]++;
		}
		dbg.on;
		console.info(winners);
		dbg.off;
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