var mb;
if (typeof(BN)!="undefined") {
	mb = {BN: BN, Node: Node, State: State};
}
else {
	fs = require('fs');
	mb = require("./_/js/makeBelieve.js");
	tests = require("./_/js/engineTests.js").tests;
}

var src = fs.readFileSync('./test/small_bns/12nodegrid.xdsl').toString();
// var src = fs.readFileSync('./test/WaterShortRandom.xdsl').toString();
// var bn = new mb.BN({source: src, format: 'xdsl'});
// bn.updateBeliefs();
// (async _=> {
// for (let i=0;i<10;i++)await tests.perfTestEvidence_12nodegrid(bn);
// })();
/*(async _=> {
for (let i=0;i<1;i++)await tests.perf_multiply();
})();*/
tests.compare(tests.perf_multiply);