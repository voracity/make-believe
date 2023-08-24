onmessage = function(e) {
	if (e.data.type == 'runFunction') {
		let func = (new Function('', 'return '+e.data.funcStr))();
		let result = func(...e.data.args);
		postMessage({type: 'result', result, id: e.data.id});
	}
}