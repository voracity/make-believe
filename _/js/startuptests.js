function startUpTests() {
	// Factor.testMultiply();
	dbg.on;
	let f = new Factor(); f.make(['a','b','c'], [2,1,2], [0.03,0.04,0.05,.14], null, [null,[1],null])
	console.log(f.toString());
	console.log(f.marginalize1('a').toString());
	console.log(f.marginalize2('a').toString());
	let f2 = Factor.makeTestFactor(5)
	console.log(f2.toString());
	console.log(f2.marginalize1('E').toString());
	console.log(f2.marginalize2(['E']).toString());
	console.log(f2.marginalize1('E').marginalize1('C').toString());
	console.log(f2.marginalize2(['E','C']).toString());
}