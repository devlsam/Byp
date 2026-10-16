export namespace core {
	
	export class TrafficStats {
	    uploadSpeed: number;
	    downloadSpeed: number;
	    totalUpload: number;
	    totalDownload: number;
	
	    static createFrom(source: any = {}) {
	        return new TrafficStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.uploadSpeed = source["uploadSpeed"];
	        this.downloadSpeed = source["downloadSpeed"];
	        this.totalUpload = source["totalUpload"];
	        this.totalDownload = source["totalDownload"];
	    }
	}

}

export namespace main {
	
	export class AppState {
	    connected: boolean;
	    activeProfileId: string;
	    activeMode: string;
	    coreVersion: string;
	    settings: storage.Settings;
	    stats: core.TrafficStats;
	
	    static createFrom(source: any = {}) {
	        return new AppState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.connected = source["connected"];
	        this.activeProfileId = source["activeProfileId"];
	        this.activeMode = source["activeMode"];
	        this.coreVersion = source["coreVersion"];
	        this.settings = this.convertValues(source["settings"], storage.Settings);
	        this.stats = this.convertValues(source["stats"], core.TrafficStats);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace storage {
	
	export class Profile {
	    id: string;
	    name: string;
	    protocol: string;
	    server: string;
	    port: number;
	    rawLink: string;
	    outboundJson: string;
	    ping: number;
	    subscriptionId?: string;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.protocol = source["protocol"];
	        this.server = source["server"];
	        this.port = source["port"];
	        this.rawLink = source["rawLink"];
	        this.outboundJson = source["outboundJson"];
	        this.ping = source["ping"];
	        this.subscriptionId = source["subscriptionId"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Settings {
	    mode: string;
	    socksPort: number;
	    httpPort: number;
	    selectedProfileId: string;
	    autoConnect: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.socksPort = source["socksPort"];
	        this.httpPort = source["httpPort"];
	        this.selectedProfileId = source["selectedProfileId"];
	        this.autoConnect = source["autoConnect"];
	    }
	}
	export class Subscription {
	    id: string;
	    name: string;
	    url: string;
	    profileCount: number;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Subscription(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.url = source["url"];
	        this.profileCount = source["profileCount"];
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

