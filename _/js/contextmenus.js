class DisplayItemContextMenu {
	constructor(textBox) {
		this.textBox = textBox;
		this.events = new ListenerGroup();
		this.events.add(this.textBox, 'update', msg => this.refreshView(msg));
	}
	
	close() {
		this.events.remove();
		this.rootEl?.remove?.();
	}
	
	make() {
		this.rootEl = n('div.contextMenu.textMenu.dialog');
		
		let options = n('div.options',
			n('div.editControls',
				n('button.delete', 'Delete', {on: {click: event => {
					/// Actually, I need to do this as a message
					this.textBox.guiDelete();
					this.rootEl.remove();
				}}}),
			),
			n('div.fields',
				n('div.field', n('label', 'TextBox ID:'), n('input', {type: 'text', name: 'id'})),
				n('div.field', n('label', 'Dimensions:'), n('span',
					'W:', n('input', {type: 'text', name: 'width', class: 'width dimension'}),
					' H:', n('input', {type: 'text', name: 'height', class: 'height dimension'}),
				)),
			),
		);
		
		let jsColorOpts = '{zIndex: 100000, hash: true}';
		let format = n('div.format',
			n('div.fields',
				n('div.field', n('label', 'Background:'), n('input', {name: 'backgroundColor', dataObject: 'format', class: 'jscolor', dataJscolor: jsColorOpts})),
				n('div.field', n('label', 'Border:'), n('input', {name: 'borderColor', dataObject: 'format', class: 'jscolor', dataJscolor: jsColorOpts})),
				n('div.field', n('label', 'Text:'), n('input', {name: 'fontColor', dataObject: 'format', class: 'jscolor', dataJscolor: jsColorOpts})),
				n('div.field', n('label', 'Font Family:'), n('select', {name: 'fontFamily', dataObject: 'format'},
					n('option', 'Arial'),
					n('option', 'Courier New'),
					n('option', 'Tahoma'),
					n('option', 'Times New Roman'),
					n('option', 'Verdana'),
				)),
				n('div.field', n('label', 'Font Size:'), n('input', {type:'text', name:'fontSize', dataObject: 'format'})),
				n('div.field', n('label', 'Padding:'), n('input', {type:'text', name:'padding', dataObject: 'format'})),
			),
		);
		
		var tabs = new TabSet([
			{id: 'main', label: 'Options', content: options, active: true},
			{id: 'format', label: 'Format', content: format},
		]).$tabs[0];

		this.rootEl.append(
			tabs,
			n('div.controls',
				n('button', {name: 'pin'}, 'Pin'),
				n('button', {name: 'save', on_click:_=>this.save()}, 'Save'),
			),
		);
	}
	
	refreshView(m) {
		if (m.size?.width!==undefined) {
			q(this.rootEl).q('[name=width]').set({value: m.size.width});
		}
		if (m.size?.height!==undefined) {
			q(this.rootEl).q('[name=height]').set({value: m.size.height});
		}
		if (m.id!==undefined) {
			q(this.rootEl).q('[name=id]').set({value: m.id});
		}
		if (m.format) {
			for (let [k,value] of Object.entries(m.format)) {
				q(this.rootEl).q(`[name=${k}]`)?.set?.({value});
			}
		}
	}
	
	save(m = {}) {
		m.size ??= {};
		m.size.width = q(this.rootEl).q('[name=width]').value || null;
		m.size.height = q(this.rootEl).q('[name=height]').value || null;
		m.id = q(this.rootEl).q('[name=id]').value || null;
		m.format = Object.fromEntries(q(this.rootEl).qa('[data-object=format]').filter(el=>el.dataset.updated=='true').map(el => [el.name,el.value]));
		this.textBox.update(m);
	}
	
	popup(o) {
		this.make();
		this.refreshView(this.textBox);
		popupElement(this.rootEl, document.body, o.left, o.top);
		if (jscolor)  jscolor.installByClassName('jscolor');
		this.eventHandlers();
	}
	
	eventHandlers() {
		this.events.add(q(this.rootEl).q('.format'), 'input change', event => {
			event.target.dataset.updated = 'true';
		});
		// prevent jscolor from trying to update the input on blur
		q(this.rootEl).q('.format').listeners.add(['blur',this.events], event => {
			if (event.target.matches('.jscolor') && event.target.value.trim()=='') {
				event.target.style.background = '';
				event.stopPropagation();
			}
		},{capture:true});
		
		
		/// Closing/Pinning
		this.events.add(document, 'click.clickOut', event => {
			if (event.target.closest('.contextMenu') != this.rootEl && !event.target.closest('.jscolorPicker')) {
				this.close();
			}
		});
		this.events.add(q(this.rootEl).q('button[name=pin]'), 'click', event => {
			this.events.remove(document, 'click.clickOut');
			event.target.replaceWith(n('button', {name:'close', on_click: _=> this.close()}, 'Close'));
		});
		
		this.eventHandlers_move();
	}
	
	eventHandlers_move() {
		this.events.add(this.rootEl, 'mousedown', event => {
			if (event.target.matches('.tabStrip button')) {
				let origElRect = this.rootEl.getBoundingClientRect();
				let origEvent = event;
				this.events.add(document, 'mousemove.moving', event => {
					let moveX = event.clientX - origEvent.clientX;
					let moveY = event.clientY - origEvent.clientY;
					
					this.rootEl.style.left = (origElRect.left + moveX)+"px";
					this.rootEl.style.top = (origElRect.top + moveY)+"px";
				});
				this.events.add(document, 'mouseup.moving', event => {
					this.events.remove('.moving');
				});
			}
		});
	}
}

class TextContextMenu extends DisplayItemContextMenu {}

class SubmodelContextMenu extends DisplayItemContextMenu {
	make() {
		super.make();
		q(this.rootEl).q('.main .options .fields').replaceWith(n('div.fields',
			n('div.field', n('label', 'Submodel ID:'), n('input', {type: 'text', name: 'id'})),
			n('div.field', n('label', 'Label:'), n('input', {type: 'text', name: 'label'})),
			// n('div.field', n('label', 'Type:'), typeSel),
			n('div.field', n('label', 'Submodel:'), n('input', {type: 'text', name: 'submodel'})),
			// n('div.field', n('label', 'Intervene:'), n('input', {type: 'checkbox', name: 'intervene'})),
			n('div.field', n('label', 'Dimensions:'), n('span',
				'W:', n('input', {type: 'text', name: 'width', class: 'width dimension'}),
				' H:', n('input', {type: 'text', name: 'height', class: 'height dimension'}),
			)),
			n('div.field.wide', n('label', 'Comment:'), n('textarea', {name: 'comment'})),
		));
	}
	
	refreshView(m) {
		super.refreshView(m);
		if (m.label!==undefined) {
			q(this.rootEl).q('[name=label]').value = m.label;
		}
		if (m.comment!==undefined) {
			q(this.rootEl).q('[name=comment]').textContent = m.comment;
		}
		if (m.submodelPath!==undefined) {
			q(this.rootEl).q('[name=submodel]').value = BN.makeSubmodelPathStr(m.submodelPath);
		}
	}
	
	save(m = {}) {
		m.label = q(this.rootEl).q('[name=label]').value;
		m.comment = q(this.rootEl).q('[name=comment]').value;
		m.submodelPath = BN.makeSubmodelPath(q(this.rootEl).q('[name=submodel]').value);
		super.save(m);
	}
}

class NodeContextMenu {
	constructor(node) {
		this.node = node;
		/**
			The update network is a lot more complicated than I'd like, but looks roughly like this:
			
			 Undo (back/forwards messages only)
			  |
			  |
			  v
			Node -> Context -> NodeShadow
			  |        ^          |
			  |        |-----> DefEditor
			  |                   |
			 Def ------------> DefShadow
			 
			 (arrows indicate auto-updates on change)
		*/
		addObjectLinks(this);
		this.nodeShadow = addObjectLinks({});
		this.bindObject(this.nodeShadow, 'out-only');
		this.bindObject(this.node, 'in-only');
		this.nodeShadow.handleObjectUpdate = function(o, updateId = null) {
			let doCopy = o._source != 'node';
			this.copyObject(o, null, null, null, {_statesChanges: doCopy, _moveParents: doCopy});
		};
		
		this.outsideClickEvent = null;
		this.definitionEditor = null;
		this.oldDefinitionEditors = {};
	}
	
	close() {
		this.unbindObject(this.nodeShadow);
		this.unbindObject(this.node);
		this.unbindObject(this.definitionEditor);
	}
	
	make() {
		let typeSel = n('select', {name: 'type'},
			[['nature','Nature'], ['decision', 'Decision'], ['utility', 'Utility']].map(v => n('option', {value: v[0]}, v[1])),
			//['x']
		);
		let views = [
			['bareLabel', 'Bare Label'],
			['label', 'Label'],
			['labelStates', 'Label & States'],
			['detailed', 'Detailed'],
			['stacked', 'Stacked Bar'],
		];
		let options = n('div.options',
			n('div.editControls',
				n('button.delete', 'Delete', {on: {click: event => {
					/// Actually, I need to do this as a message
					this.node.guiDelete();
					this.menu.remove();
				}}}),
			),
			n('div.fields',
				n('div.field', n('label', 'Node ID:'), n('input', {type: 'text', name: 'id'})),
				n('div.field', n('label', 'Label:'), n('input', {type: 'text', name: 'label'})),
				n('div.field', n('label', 'Type:'), typeSel),
				n('div.field', n('label', 'Submodel:'), n('input', {type: 'text', name: 'submodel'})),
				n('div.field', n('label', 'Intervene:'), n('input', {type: 'checkbox', name: 'intervene'})),
				n('div.field', n('label', 'Evidence:'), n('span.evidenceInput', n('select', {name: 'evidence'}))),
				n('div.field.wide', n('label', 'Comment:'), n('textarea', {name: 'comment'})),
			),
		);
		
		let states = n('div.states',
			n('select.stateSpaceType', {name: 'stateSpace.type'},
				n('option', {value: 'categorical'}, 'Discrete: Categorical'),
				n('option', {value: 'ordered'}, 'Discrete: Ordered'),
				n('option', {value: 'point'}, 'Discrete: Point Values'),
				n('option', {value: 'interval'}, 'Discrete: Intervals'),
				n('option', {value: 'continuous'}, 'Continuous'),
			),
			/*n('p.discretizationMessage', 'The definition type requires a discretization'),*/
			n('div.stateSpaceDetails', 
				n('div.continuous', 
					n('label.discretized', n('input', {type: 'checkbox', name: 'stateSpace.discretized'}), 'Discretized'),
					n('label.forChildrenOnly', n('input', {type: 'checkbox', name: 'stateSpace.forChildrenOnly'}), 'For Children Only'),
					n('button.guessStates', 'Guess States'),
				),
				n('table.stateSpace', 
					n('tr.header', 
						n('th.delete', ''),
						n('th.id', 'State'),
						n('th.label', 'Label'),
						n('th.value', 'Value'),
						n('th.minimum', 'Boundaries'),
					),
					n('template', {class: 'newStateRow'},
						n('tr.state', 
							n('td.delete', n('button.delete', 'x')),
							n('td.id', {contenteditable: ''}),
							n('td.label', {contenteditable: ''}),
							n('td.value', {contenteditable: ''}),
							n('td.minimum', {contenteditable: ''}),
						),
					),
					n('tbody.stateList'),
					n('tr.footer',
						n('th.add', n('button', {name: 'addState'}, '+')),
					),
				),
			),
		);
		
		/// NodeDefinitions is defined in definitions.js
		let definition = n('div.definition',
			n('div.toolbar',
				n('select.defType',
					Object.entries(NodeDefinitions).map(([typeId,type]) => n('option', {value: typeId, selected: typeId==this.node.def.type?true:null}, type.typeLabel))
				),
				n('span.approxTranslation',
					'Auto-translated from original definition'
				),
			),
			n('div.defBody',
				/// Body is only filled on demand
			),
		);
		/// Definition body is made on demand with this function
		let definitionSelected = (event, tab) => {
			/// If definition already made, don't make it again
			if (tab.querySelector('.definitionMade'))  return;
			
			this.definitionEditor.make();
			tab.querySelector('.defBody').classList.add('definitionMade');
		}
		
		let jsColorOpts = '{zIndex: 100000, hash: true}';
		let format = n('div.format',
			n('div.fields',
				n('div.field', n('label', 'View:'),
					n('select', {name: 'displayStyle', dataObject: 'format'},
						n('option', {value: 'default'}, 'Default'),
						views.map(v => n('option', {value: v[0]}, v[1])),
						/*{on: {input: event => {
							let opt = event.target.value;
							this.node.setStyle(opt);
						}}},*/
					)
				),
				n('div.field', n('label', 'Background:'), n('input', {name: 'backgroundColor', dataObject: 'format', class: 'jscolor', dataJscolor: jsColorOpts})),
				n('div.field', n('label', 'Border:'), n('input', {name: 'borderColor', dataObject: 'format', class: 'jscolor', dataJscolor: jsColorOpts})),
				n('div.field', n('label', 'Text:'), n('input', {name: 'fontColor', dataObject: 'format', class: 'jscolor', dataJscolor: jsColorOpts})),
				n('div.field', n('label', 'Font Family:'), n('select', {name: 'fontFamily', dataObject: 'format'},
					n('option', 'Arial'),
					n('option', 'Courier New'),
					n('option', 'Tahoma'),
					n('option', 'Times New Roman'),
					n('option', 'Verdana'),
				)),
				n('div.field', n('label', 'Font Size:'), n('input', {type:'text', name:'fontSize', dataObject: 'format'})),
			),
		);
		
		let tabSet = new TabSet([
			{id: 'main', label: 'Options', content: options, active: true},
			{id: 'states', label: 'States', content: states},
			{id: 'definition', label: 'Definition', content: definition, onselect: definitionSelected},
			{id: 'format', label: 'Format', content: format},
		]).$tabs[0];
		this.menu = n('div.contextMenu.nodeMenu.dialog',
			tabSet,
			n('div.controls',
				n('button', {name: 'pin'}, 'Pin'),
				n('button', {name: 'save'}, 'Save'),
			),
		);
		
		
		this.handleEvents();
		/// How to handle |parents|? IDs only?
		/// |this.nodeShadow| will now have values for all these attributes. i.e. Hitting 'Save' will update
		/// all of these attributes.
		let msg = Object.assign(pick(this.node,'id','label','type','submodel','intervene','comment','format','displayStyle','states','stateSpace'),{defType: this.node.def.type});
		/// Create shadow copy of node first
		let msgId = Math.random();
		this.nodeShadow.updateObject(msg, msgId);
		/// Then update this view (which will pointlessly update the nodeShadow again, unless msgId is set)
		this.updateObject(msg, msgId);

		return this.tabSet;
	}
	
	popup(o) {
		this.make();
		/*this.menu.style.left = (o.left + 5)+'px';
		this.menu.style.top = (o.top + 5)+'px';
		this.menu.style.display = 'block';
		document.body.append(this.menu);*/
		popupElement(this.menu, document.body, o.left, o.top);
		if (jscolor)  jscolor.installByClassName('jscolor');
		let clickEvent = null;
		this.outsideClickEvent = event => {
			if (event.target.closest('.contextMenu') != this.menu && !event.target.closest('.jscolorPicker')) {
				this.menu.remove();
				this.close();
				document.removeEventListener('click', this.outsideClickEvent);
				document.removeEventListener('contextmenu', this.outsideClickEvent);
			}
		}
		/// Put these *outside* any currently running events (otherwise, they may execute straight away)
		setTimeout(_=> {
			document.addEventListener('click', this.outsideClickEvent);
			document.addEventListener('contextmenu', this.outsideClickEvent);
		}, 0);
	}
	
	handleEvents() {
		let menuEl = this.menu;
		[...menuEl.querySelectorAll('input[name], textarea[name], select[name]')].forEach(inp => inp.addEventListener('input', event => {
			let field = event.target.getAttribute('name');
			if (field == 'evidence')  return;
			let objName = event.target.getAttribute('data-object');
			console.log(objName, field);
			let value = event.target.value;
			if (objName) {
				if (field == "fontSize")  value = value.replace(/pt$/, '');
				this.updateLinkedObjects({[objName]: {[field]: value}});
			}
			else {
				if (event.target.matches('input[type=checkbox]'))  value = event.target.checked;
				
				let updObj = this.expandKeys({[field]: value});
				if (field == "stateSpace.type") {
					//this.updateObject({[field]: value});
					this.updateObject(updObj);
				}
				else {
					//this.updateLinkedObjects({[field]: value});
					this.updateLinkedObjects(updObj);
				}
			}
		}));
		[...menuEl.querySelectorAll('input.jscolor')].forEach(inp => inp.addEventListener('change', event => {
			var evt = new Event('input');
			evt.initEvent("input", false, true);
			event.target.dispatchEvent(evt);
		}));
		
		/** States **/
		/// We need to keep track of added states and deleted states.
		///	We'll also need to track state order
		let stateList = menuEl.querySelector('.stateList');
		stateList.addEventListener('input', event => {
			this.updateLinkedObjects(this.gatherStatesUpdates());
		});
		menuEl.querySelector('button[name=addState]').addEventListener('click', event => {
			let numStates = menuEl.querySelectorAll('.stateList tr').length - 1;
			let stateId = `state${numStates}`, stateIndex = numStates;
			this.updateObject({_addState: {id: stateId, index: stateIndex}});
		});
		stateList.addEventListener('click', event => {
			if (event.target.matches('.state button.delete')) {
				if (this.nodeShadow.states.length<=1)  return;
				let tr = event.target.closest('tr');
				let table = tr.closest('table');
				this.updateObject({_removeState: {index: tr.rowIndex - 1}});
			}
		});
		menuEl.querySelector('.discretized input[type=checkbox]').addEventListener('change', event => {
			this.updateObject({stateSpace: {discretized: event.target.checked}});
		});
		menuEl.querySelector('.forChildrenOnly input[type=checkbox]').addEventListener('change', event => {
			this.updateObject({stateSpace: {forChildrenOnly: event.target.checked}});
		});
		menuEl.querySelector('button.guessStates').addEventListener('click', event => {
			
			/// XXX To be done
			
			
			/// Does the definition know how to generate states?
			/*let states = this.def.getStates();
			if (states) {
				this.updateObject({states});
			}
			/// If not, run an inference with no evidence*/
		});
		
		menuEl.querySelector('.defType').addEventListener('change', event => {
			console.log(event.target.value);
			this.updateObject({defType: event.target.value});
		});
		
		/** Main control buttons **/
		menuEl.querySelector('button[name=save]').addEventListener('click', event => {
			/// Update definition if needed (treat specially, because it can be expensive)
			let defHasChanges = false;
			if (this.definitionEditor && this.definitionEditor.hasChanges) {
				defHasChanges = true;
				let def = this.definitionEditor.getDefinitionUpdateMessage();
				this.nodeShadow.def = def;
			}
			if (defHasChanges && this.nodeShadow.def && this.nodeShadow.def.invalid) {
				let dialog = popupDialog(this.nodeShadow.def.invalid, {buttons: [
					n('button', 'OK', {type:'button', on: {click: event => {
						dismissDialog(dialog);
						event.stopPropagation();
					}}}),
				]});
			}
			else {
				/// Update any of the general properties
				/// XXX: This will send the update back through this context menu (since Node -> Context)
				/// Can generate an updateId to prevent that (which I should do eventually), but it's
				/// useful for debugging to get immediate feedback on whether the node updated properly.
				this.nodeShadow._menuUpdate = true;
				this.node.updateObject(this.nodeShadow);
				delete this.nodeShadow._menuUpdate;
				/// Since the node is now synced:
				/// - eliminate states changes
				/// - eliminate old definition editors
				delete this.nodeShadow._statesChanges;
				this.oldDefinitionEditors = {};
			}
			/// eliminate |def|, because it's shadowed separately (not necessary, but to avoid confusion)
			delete this.nodeShadow.def;
			
			this.node.net.setEvidence({[this.node.id]: (v=>v=="0"?0:Number(v)||null)(q(menuEl).q('[name=evidence]').value)});
			
			if (defHasChanges)  this.node.net.notifyDefinitionsChanged();
		});
		menuEl.querySelector('button[name=pin]').addEventListener('click', event => {
			if (this.outsideClickEvent) {
				document.removeEventListener('contextmenu', this.outsideClickEvent);
				document.removeEventListener('click', this.outsideClickEvent);
				this.outsideClickEvent = null;
			}
			event.target.replaceWith(n('button', {name:'close', on: {
				click: _=> { this.menu.remove(); }
			}}, 'Close'));
		});
		
		this.handleEvents_move();
	}
	
	handleEvents_move() {
		this.menu.addEventListener('mousedown', event => {
			if (event.target.matches('.tabStrip button')) {
				let func1 = null, func2  = null;
				let origElRect = this.menu.getBoundingClientRect();
				let origEvent = event;
				document.addEventListener('mousemove', func1 = event => {
					let moveX = event.clientX - origEvent.clientX;
					let moveY = event.clientY - origEvent.clientY;
					
					this.menu.style.left = (origElRect.left + moveX)+"px";
					this.menu.style.top = (origElRect.top + moveY)+"px";
				});
				document.addEventListener('mouseup', func2 = event => {
					document.removeEventListener('mousemove', func1);
					document.removeEventListener('mouseup', func2);
				});
			}
		});
	}
	
	gatherStatesUpdates() {
		let stateList = this.menu.querySelector('.stateList');
		let states = [];
		let _statesChanges = {
			added: [],
			deleted: stateList.dataset.deleted ? JSON.parse(stateList.dataset.deleted) : [],
			order: {},
		};
		let numAdded = 0;
		[...stateList.querySelectorAll('tr.state,tr.maximum')].forEach((tr,trI) => {
			/// Use this minimum as last maximum, for everything but first row
			if (trI!=0) {
				let td = tr.querySelector('.minimum');
				states[states.length-1].maximum = isNaN(parseFloat(td.textContent)) ? null : Number(td.textContent);
			}
			/// Treat last (maximum) row differently
			if (!tr.matches('.maximum')) {
				let state = {};
				let stateFields = 'id label value minimum maximum'.split(/\s/);
				[...tr.querySelectorAll('td')].forEach(td => {
					if (!stateFields.includes(td.className))  return;
					state[td.className] = isNaN(parseFloat(td.textContent))
						? td.textContent==='' ? null : td.textContent
						: Number(td.textContent);
				});
				states.push( state );
				if (tr.matches('.added')) {
					_statesChanges.added.push(trI);
					numAdded++;
				}
				else {
					/// Check for state order changes. Needs to be run before states are added back in
					let origIndex = tr.dataset.index;
					_statesChanges.order[origIndex] = trI - numAdded;
				}
			}
		});
		console.log(states, _statesChanges);
		return {states, _statesChanges};
	}
	
	handleObjectUpdate(m, updateId = null) { this.refreshView(m, updateId); }
	
	refreshView(m, updateId = null) {
		/// Make sure the message is consistent. Fix if not.
		/// If the message was managed by its own class, that class would make sure the message
		/// was consistent...
		if (m.defType) {
			let preferredStateSpaces = new NodeDefinitions[m.defType]().getPreferredStateSpaces();
			let currentStateSpaceType = (m.stateSpace && m.stateSpace.type) || this.nodeShadow.stateSpace.type;
			if (preferredStateSpaces && !preferredStateSpaces.includes(currentStateSpaceType)) {
				/// We update the message, because it was essentially in an inconsistent state before
				/// (A definition coupled with a non-preferred state space)
				/// XXX Not sure how I feel about this
				this.copyObject.call(m, {stateSpace: {type: preferredStateSpaces[0]}});
			}
		}
				
		let menuEl = this.menu;
		if (m.id)  menuEl.querySelector('input[name=id]').value = m.id;
		if (m.label)  menuEl.querySelector('input[name=label]').value = m.label;
		if (m.type)  menuEl.querySelector('select[name=type]').value = m.type;
		if (m.submodel)  menuEl.querySelector('select[name=submodel]').value = m.submodel;
		if (m.comment!=null)  menuEl.querySelector('textarea[name=comment]').value = m.comment;
		if (m.intervene!=null)  menuEl.querySelector('input[name=intervene]').checked = m.intervene;
		if (m.format) {
			let backgroundColor = m.format.backgroundColor;
			let borderColor = m.format.borderColor;
			let fontColor = m.format.fontColor;
			let fontFamily = m.format.fontFamily;
			let fontSize = m.format.fontSize;
			let displayStyle = m.format.displayStyle;
			/// Pull default styles from CSS. Not so sure if this is the right place for them or not.
			let testNode = n('div.node#test');
			document.body.append(testNode);
			let nodeStyle = getComputedStyle(testNode);
			if (backgroundColor !== undefined) {
				if (backgroundColor === null) {
					backgroundColor = rgb2Hex(nodeStyle.backgroundColor);
				}
				let el = menuEl.querySelector('input[name=backgroundColor]');
				el.value = backgroundColor;
				/// For jscolor
				triggerEvent(el, 'change');
			}
			if (borderColor !== undefined) {
				if (borderColor === null) {
					borderColor = rgb2Hex(nodeStyle.borderBottomColor);
				}
				let el = menuEl.querySelector('input[name=borderColor]');
				el.value = borderColor;
				/// For jscolor
				triggerEvent(el, 'change');
			}
			if (fontColor !== undefined) {
				if (fontColor === null) {
					fontColor = rgb2Hex(nodeStyle.color);
				}
				let el = menuEl.querySelector('input[name=fontColor]');
				el.value = fontColor;
				/// For jscolor
				triggerEvent(el, 'change');
			}
			if (fontFamily !== undefined) {
				if (fontFamily === null) {
					fontFamily = nodeStyle.fontFamily.toLowerCase().replace(/\b./g, m => m.toUpperCase());
				}
				menuEl.querySelector('select[name=fontFamily]').value = fontFamily;
			}
			if (fontSize !== undefined) {
				if (fontSize === null) {
					/// This won't be right on many devices. Replace with the real default (from the CSS, but
					/// not on the node, apparently)
					fontSize = Math.round(parseFloat(nodeStyle.fontSize)/72*96);
				}
				menuEl.querySelector('input[name=fontSize]').value = fontSize+'pt';
			}
			if (displayStyle !== undefined) {
				menuEl.querySelector('select[name=displayStyle]').value = displayStyle;
			}
			testNode.remove();
		}
		/** _addState/_moveState/_removeState' handle small state mutations. 'states' handles
		    changes to all states.
			
			Essentially, the HTML table is the source of truth, so update that first. (But the nodeShadow
			should always be in sync here, except when that table is being html edited.)

			**/
		if (m._addState !== undefined) {
			let {id, index} = m._addState;
			
			//let numStates = menuEl.querySelectorAll('.stateList tr').length - 1;
			let newRow = document.importNode(menuEl.querySelector('.newStateRow').content, true);
			newRow.querySelector('tr').classList.add('added');
			/// Grab it now, because newRow will void itself
			let td = newRow.querySelector('td:nth-child(2)');
			td.textContent = id;
			menuEl.querySelector(`.stateList tr:nth-child(${index})`).after(newRow);
			if (isVisible(td)) {
				td.focus();
				selectContents(td);
			}
			this.nodeShadow.updateObject(this.gatherStatesUpdates());
			menuEl.querySelectorAll('.state button.delete[disabled]').forEach(el => el.disabled = false);
		}
		if (m._moveState !== undefined) {
			let {oldI, newI} = m._moveState;
			
			let movingRow = menuEl.querySelector(`.stateList tr:nth-child(${oldI+1})`);
			let refRow = menuEl.querySelector(`.stateList tr:nth-child(${newI+1})`);
			if (oldI > newI)  refRow.before(movingRow);
			else              refRow.after(movingRow);
			
			this.nodeShadow.updateObject(this.gatherStatesUpdates());
		}
		if (m._removeState !== undefined) {
			let {index} = m._removeState;
			
			let tr = menuEl.querySelector(`.stateList tr:nth-child(${index+1})`);
			if (tr.dataset.index) {
				let del = tr.closest('.stateList').dataset.deleted;
				if (!del)  del = [];
				else       del = JSON.parse(del);
				del.push(Number(tr.dataset.index));
				tr.closest('.stateList').dataset.deleted = JSON.stringify(del);
			}
			tr.remove();
			/// I need to stop propagation after the remove. If I don't remove,
			/// I don't need stop propagation. Confused.
			event.stopPropagation();
			this.nodeShadow.updateObject(this.gatherStatesUpdates());
			if (this.nodeShadow.states.length<=1) {
				menuEl.querySelector('.state button.delete').disabled = true;
			}
		}
		if (m.states) {
			console.log('states', m.states);
			let stateList = menuEl.querySelector('.stateList');
			stateList.innerHTML = '';
			delete stateList.dataset.deleted;
			
			let lastState = null;
			console.log(m.states);
			for (let [stateI,state] of m.states.entries()) {
				let stateRow = n('tr.state', {dataIndex: stateI},
					n('td.delete', n('button.delete', 'x')),
					n('td.id', {contenteditable: ''}, state.id),
					n('td.label', {contenteditable: ''}, state.label),
					n('td.value', {contenteditable: ''}, state.value),
					n('td.minimum', {contenteditable: ''}, state.minimum),
				);
				stateList.append(stateRow);
				lastState = state;
			}
			stateList.append(n('tr.maximum',
				n('td.blank'), n('td.blank'),n('td.blank'),n('td.minimum', {contenteditable: ''}, lastState.maximum),
			));
			let opts = q(menuEl).qa('[name=evidence] option').slice(1);
			let changedStates = !m.states.reduce((a,v,i)=>a && v.id==opts[i]?.dataset.id, true);
			if (changedStates) {
				q(menuEl).q('[name=evidence]').set({innerHTML:''})
					.append(n('option'))
					.append(...m.states.map((s,i) => n('option', {value:i,dataId:s.id}, s.label || s.id)));
			}
		}
		if (m.stateSpace) {
			if (m.stateSpace.type || m.stateSpace.discretized !== undefined) {
				let ss = menuEl.querySelector('table.stateSpace');
				let stateSpaceType = m.stateSpace.type || this.nodeShadow.stateSpace.type;
				let discretized = m.stateSpace.discretized !== undefined ? m.stateSpace.discretized : this.nodeShadow.stateSpace.discretized;
				if (stateSpaceType != 'continuous' || discretized) {
					ss.classList.remove('notApplicable');
				}
				else {
					ss.classList.add('notApplicable');
				}
			}
			if (m.stateSpace.type) {
				let stateSpaceList = menuEl.querySelector('.stateSpaceType');
				stateSpaceList.value = m.stateSpace.type;
				/// We also need to update a few other things in the context menu
				let stateSpace = menuEl.querySelector('table.stateSpace');
				stateSpace.setAttribute('data-state-space-type', m.stateSpace.type);
				if (m.stateSpace.type == 'continuous') {
					menuEl.querySelector('.continuous').classList.remove('notApplicable');
				}
				else {
					menuEl.querySelector('.continuous').classList.add('notApplicable');
				}
			}
			if (m.stateSpace.discretized !== undefined) {
				menuEl.querySelector('input[name="stateSpace.discretized"]').checked = m.stateSpace.discretized;
				if (m.stateSpace.discretized) {
					menuEl.querySelectorAll('.forChildrenOnly, .guessStates').forEach(el => el.classList.remove('notApplicable'));
					// ss.querySelectorAll('*[contenteditable]').forEach(el => el.setAttribute('contenteditable', true));
					// ss.querySelectorAll('button').forEach(el => el.removeAttribute('disabled'))
				}
				else {
					menuEl.querySelectorAll('.forChildrenOnly, .guessStates').forEach(el => el.classList.add('notApplicable'));
					// ss.querySelectorAll('*[contenteditable]').forEach(el => el.setAttribute('contenteditable', false));
					// ss.querySelectorAll('button').forEach(el => el.setAttribute('disabled', ''));
				}
			}
		}
		if (m.defType) {
			console.log('DEFTYPE:', m.defType);
			menuEl.querySelector('.defType').value = m.defType;
			let defBody = menuEl.querySelector('.defBody');
			/// This needs to be updated whenever the definition type changes
			let oldEditor = this.definitionEditor;
			menuEl.querySelector('.approxTranslation').classList.remove('active');
			if (oldEditor) {
				/// Move old defBody children in to a temp node
				let oldDefContents = n('div', ...defBody.children);
				this.oldDefinitionEditors[oldEditor.type] = {oldEditor, oldDefContents};
				/// Unbind the old
				this.unbindObject(oldEditor);
				if (this.node.def.type != m.defType) {
					menuEl.querySelector('.approxTranslation').classList.add('active');
				}
			}
			
			let oldInfo = this.oldDefinitionEditors[m.defType];
			if (oldInfo) {
				this.definitionEditor = oldInfo.oldEditor;
				/// This shouldn't be necessary, but here just in case
				defBody.innerHTML = '';
				defBody.append(...oldInfo.oldDefContents.children);
				/// Rebind the old editor
				this.bindObject(this.definitionEditor);
				/// Re-init the old editor, in case things have changed
				this.definitionEditor.init(this.node, this.node.parents, this.node.def, defBody);
			}
			else {
				this.definitionEditor = new NodeDefinitions[m.defType].Editor(this.nodeShadow, this.node.parents, this.node.def, defBody);
				if (isVisible(defBody)) {
					this.definitionEditor.make({oldEditor});
				}
				/// Bind in the new
				this.bindObject(this.definitionEditor);
			}
		}
		/// Unconditionally update the evidence selector
		if(!m._menuUpdate)  menuEl.querySelector('select[name=evidence]').value = this.node.net.evidence[this.node.id];
		/// if (m.def) --- not handled here
		/*/// If the definition has been updated, pass it through to the editor (but
		/// only if it's already been setup)
		if (m.def) {
			if (this.definitionEditor) {
				/// We pass the full update message, in case the editor wants to look at
				///	anything else that might have changed
				definitionEditor.updateObject(m, updateId);
			}
		}*/
	}
}

function triggerEvent(el, eventName) {
	let evt = new Event(eventName);
	evt.initEvent(eventName, false, true);
	el.dispatchEvent(evt);
}