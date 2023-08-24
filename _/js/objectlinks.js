/** Linked/synced objects. |addObjectLinks| needs to be called on the instance (say, in the constructor)
as it adds properties.

NOTE: It's very important that all linked objects speak the same "language". That is, they all
must agree on the messages that are passed between each other. The internals can be entirely different,
(although by default, the internals are considered to match the externals).
**/	
function addObjectLinks(obj, defaultProperties = null) {
	let linkedItems = "Objects UpdateIds".split(/ /);
	for (let linkedItem of linkedItems) {
		Object.defineProperty(obj, '_linked'+linkedItem, {configurable: true, writable: true, value: []});
	}
	for (let [methodName,method] of Object.entries(ObjectLinkMethods)) {
		if (!obj[methodName]) {
			Object.defineProperty(obj, methodName, {configurable:true,writable:true,value: method});
		}
	}
	
	return obj;
}

function cloneToObject(target, source, o = {}) {
	o.seen = o.seen || new Set();
	o.mirror = o.mirror || null;
	/// Prevent cycles
	if (o.seen.has(target))  return;
	o.seen.add(target);
	
	if (source != null && typeof(source.length)!='undefined' && typeof(source.slice)=="function") {
		/// If source is array: 1) assume target is array, 2) update length of target, but update (don't overwrite) array elements (just like with objects)
		target.length = source.length;
		for (let key=0; key<source.length; key++) {
			// Arrays are always full copied
			//if (o.mirror && o.mirror[key]===undefined)  continue;
			cloneToObjectProperty(target, key, source[key], {seen: o.seen, mirror: o.mirror && o.mirror[key]});
		}
	}
	else {
		for (let key in source) {
			if (o.mirror && o.mirror[key]===undefined)  continue;
			cloneToObjectProperty(target, key, source[key], {seen: o.seen, mirror: o.mirror && o.mirror[key]});
		}
	}
}

function cloneToObjectProperty(target, targetProperty, source, o = {}) {
	o.seen = o.seen || new Set();
	o.mirror = o.mirror || null;
	/// Maybe do special cloning for arrays? Yes
	if (typeof(source)=="object") {
		if (source === null)  target[targetProperty] = null;
		/// If it's an array, just put a new array in target's key
		else if (typeof(source.length)!='undefined' && typeof(source.slice)=='function') {
			if (target[targetProperty] === null || target[targetProperty] === undefined || !(typeof(target[targetProperty].length)!='undefined' && typeof(target[targetProperty].slice)=='function')) {
				target[targetProperty] = [];
			}
			else if (target[targetProperty].length != source.length || !(target[targetProperty] instanceof source.constructor)) {
				target[targetProperty] = new source.constructor(source.length);
			}
		}
		/// If target is already an object, don't blow it away unless it's null
		else if (typeof(target[targetProperty])!="object" || target[targetProperty]===null)  target[targetProperty] = {};
		cloneToObject(target[targetProperty], source, o);
	}
	else {
		target[targetProperty] = source;
	}
}

let ObjectLinkMethods = {
	generateUpdateId(updateId = null) {
		if (!updateId)  updateId = Math.random(); // + '-' + new Date().getTime();
		
		this._linkedUpdateIds.push(updateId);
		if (this._linkedUpdateIds.length > 100) {
			this._linkedUpdateIds.shift();
		}
		
		return updateId;
	},

	bindObject(objects, direction = null) {
		if (!objects)  return;
		if (!objects.length || !objects[0])  objects = [objects];
		for (let object of objects) {
			if ((!direction || direction == 'out-only') && !this._linkedObjects.includes(object)) {
				this._linkedObjects.push(object);
			}
			if ((!direction || direction == 'in-only') && !object._linkedObjects.includes(this)) {
				object._linkedObjects.push(this);
			}
		}
	},
	
	unbindObject(objects) {
		if (!objects)  return;
		if (!objects.length || !objects[0])  objects = [objects];
		for (let object of objects) {
			let objIndex = this._linkedObjects.indexOf(object);
			let obj2Index = object._linkedObjects.indexOf(this);
			if (objIndex != -1) {
				this._linkedObjects.splice(objIndex, 1);
			}
			if (obj2Index != -1) {
				object._linkedObjects.splice(objIndex, 1);
			}
		}
	},
	
	/**
		If this object is the *source* of the update message, and so the object's properties
		are already properly updated (and so don't need handling), just call this method.
	**/
	updateLinkedObjects(o) {
		let updateId = this.generateUpdateId();

		/// Propagate message to linked objects
		for (let object of this._linkedObjects) {
			object.updateObject(o, updateId);
		}
	},

	updateObjectDefault(o, updateId = null) {
		/// If the updateId isn't new, don't update again
		if (this._linkedUpdateIds.includes(updateId))  return;
		
		updateId = this.generateUpdateId(updateId);
		this.handleObjectUpdate(o, updateId);
		
		/// Propagate message to linked objects
		for (let object of this._linkedObjects) {
			object.updateObject(o, updateId);
		}
	},
	
	/// Only expands top level keys (to avoid interfering in unknown descendent objects)
	expandKeys(o) {
		/// Copy, shallow only needed
		o = Object.assign({}, o);
		
		for (let key in o) {
			let parts = key.split(/\./);
			if (parts.length == 1)  continue;
			
			let value = o[key];
			delete o[key];
			
			let currentObj = o;
			let lastObj = null;
			let part = null;
			for (part of parts) {
				lastObj = currentObj;
				if (!(part in currentObj)) {
					currentObj[part] = {};
				}
				currentObj = currentObj[part];
			}
			lastObj[part] = value;
		}
		
		return o;
	},
	
	/**
		Utility function for copying properties from the message o into the current object
	**/
	copyObject(o, include = null, omit = null, mirror = null, includeHidden = null) {
		for (let [key,value] of Object.entries(o)) {
			//if (this._linkedDefaultProperties && !this._linkedDefaultProperties[key])  continue;
			if (include && !include[key])  continue;
			if (omit && omit[key])  continue;
			if (mirror && mirror[key]===undefined)  continue;
			/// Skip properties that start with _ by default
			if (key[0] == '_' && !(includeHidden && includeHidden[key]))  continue;
			/// If value is a plain object, we still need to update recursively to
			/// not blow away the existing object
			cloneToObjectProperty(this, key, value, {mirror: mirror && mirror[key]});
		}
	},
	
	/** 
		Update *this* object (first), and let it's linked objects know the message too.
		
		Override for special behaviour (like undo). Use updateObjectDefault in that case.
	**/
	updateObject(o, updateId = null) {
		this.updateObjectDefault(o, updateId);
	},
	
	/**
		This function needs to be defined, but don't call this function directly. Call updateObject instead.
		
		Default method for handleObjectUpdate
		If updating just involves property updates, updateId isn't needed.
		If there are sub-objects that also need to be updated and part of the message
		passing, use updateId and send the sub-objects the updateId
	**/
	handleObjectUpdate(o, updateId = null) {
		this.copyObject(o);
	},
}

if (typeof(exports)!="undefined") {
	Object.assign(exports, {
		addObjectLinks,
		cloneToObject,
		cloneToObjectProperty,
	});
}
