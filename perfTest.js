var mb;
if (typeof(BN)!="undefined") {
	mb = {BN: BN, Node: Node, State: State};
}
else {
	fs = require('fs');
	mb = require("./_/js/makeBelieve.js");
	tests = require("./_/js/engineTests.js").tests;
}
(async _=>{
	var src = fs.readFileSync('./test/small_bns/12nodegrid.xdsl').toString();
	var src2 = fs.readFileSync('./test/covid_omi.dne').toString();
	var src3 = fs.readFileSync('./test/WaterShort.xdsl').toString();
	// var src = fs.readFileSync('./test/WaterShortRandom.xdsl').toString();
	var bn = new mb.BN({source: src, format: 'xdsl'});
	var bn2 = new mb.BN({source: src2, format: 'dne'});
	var bn3 = new mb.BN({source: src3, format: 'xdsl'});
	// bn.updateBeliefs();
	// (async _=> {
	// for (let i=0;i<10;i++)await tests.perfTestEvidence_12nodegrid(bn);
	// })();
	/*(async _=> {
	for (let i=0;i<1;i++)await tests.perf_multiply();
	})();*/
	// tests.compare(tests.perf_marginalizeToSingle);
	// tests.compare(tests.perf_multiply);
	await tests.perf_jtreeVariableElimination({'12node':bn,'watershort':bn3,'covid_omi':bn2}, mb.mbConfig);
})();