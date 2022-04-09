const { GObject, St, GLib, Rsvg, Clutter, PangoCairo, Pango } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ByteArray = imports.byteArray;
const Cairo = imports.cairo;
const Me = ExtensionUtils.getCurrentExtension();

const Gettext = imports.gettext.domain(Me.metadata['gettext-domain']);
const _ = Gettext.gettext;

const monitor = Main.layoutManager.primaryMonitor;
let lastDown = 0, lastUp = 0;
let speedDown = 0, speedUp = 0;
let timeout;
let xFloat;
const gapTime = 3;
const size = 100;
const sMax = 20e6;	//最高速度
const svgpath = Me.path + '/img/';
//~ const micon = 'gnome-netstatus-txrx';	// 'mail-send-symbolic'
const micon = 'mail-send-symbolic-rtl';

const Indicator = GObject.registerClass(class Indicator extends PanelMenu.Button {
	_init() {
		super._init(0.0, _('Screen Net Speed'));

		const stock_icon = new St.Icon({ icon_name : micon, style_class : 'system-status-icon' });
		this.add_child(stock_icon);

		this.svgindex = ~~(Math.random() * 4) + 5;

		this.connect("button-press-event", (actor, event) => {
			xFloat.visible = !xFloat.visible;
			stock_icon.set_icon_name(xFloat.visible ? micon : "media-playback-pause-symbolic");
		});

		this.connect("scroll-event", (actor, event) => {
			switch (event.get_scroll_direction()) {
			case Clutter.ScrollDirection.UP:
				this.svgindex++;
				if (this.svgindex > 9) { this.svgindex = 1; }
				break;
			case Clutter.ScrollDirection.DOWN:
				this.svgindex--;
				if (this.svgindex < 1) { this.svgindex = 9; }
				break;
			}
			this._canvas.invalidate();
		});

		xFloat = new Clutter.Actor({
			name : 'xFloat',
			reactive : true,
			width : size,
			height : size,
		});

		this._canvas = new Clutter.Canvas();
		this._canvas.connect('draw', this.on_draw.bind(this));
		this._canvas.set_size(size, size);
		xFloat.set_size(size, size);
		xFloat.set_content(this._canvas);
		xFloat.set_position(0, monitor.height - size);	// left-down corner.

		xFloat.connect("button-press-event",
			(a) => {
				this.horizontalMove(a);
				return Clutter.EVENT_STOP;
			});
	}

	setcolor(ctx, colorstr, alpha) {
		const [, cc] = Clutter.Color.from_string(colorstr);
		ctx.setSourceRGBA(cc.red, cc.green, cc.blue, alpha);
	}

	on_draw(canvas, ctx, width, height) {
		ctx.setOperator(Cairo.Operator.CLEAR);
		ctx.paint();
		ctx.setOperator(Cairo.Operator.SOURCE);

		try {
			const hd = Rsvg.Handle.new_from_file(svgpath + "r" + this.svgindex + ".svg");
			const vp = new Rsvg.Rectangle({ x : 0, y : 0, width : size, height : size });
			hd.render_document(ctx, vp);
		} catch (e) { throw e; }

		ctx.translate(size / 2, size / 2);
		this.setcolor(ctx, "white", 1);
		ctx.moveTo(0, -size / 5);
		this.align_show(ctx, "⬇ " + this.shortStr(speedDown));
		ctx.moveTo(0, 0);
		this.align_show(ctx, "⬆ " + this.shortStr(speedUp));
	}

	align_show(ctx, showtext, font = "Sans Bold 10") {
		let pl = PangoCairo.create_layout(ctx);
		pl.set_text(showtext, -1);
		pl.set_font_description(Pango.FontDescription.from_string(font));
		PangoCairo.update_layout(ctx, pl);
		let [w, h] = pl.get_pixel_size();
		ctx.relMoveTo(-w / 2, 0);
		PangoCairo.show_layout(ctx, pl);
		ctx.relMoveTo(w / 2, 0);
	}

	horizontalMove(a) {
		let [xPos, yPos] = a.get_position();
		let newX = (xPos === 0) ? monitor.width - size : 0;
		a.rotation_angle_z = 360;

		a.ease({
			x : newX,
			rotation_angle_z : 0,
			duration : 1000,
			mode : Clutter.AnimationMode.EASE_OUT_BOUNCE,
			//~ onComplete : () => {
			//~ Main.layoutManager._queueUpdateRegions();
			//~ }
		});
	};

	verticalMove(a) {
		let r = speedDown;
		if (r > sMax) r = sMax;
		const h = Math.sin(r * Math.PI / 2 / sMax);	 // sin的x轴最高点是y=Pi/2
		let newY = parseInt(monitor.height - size - (monitor.height - size) * h);
		a.ease({
			y : newY,
			duration : 1000,
			mode : Clutter.AnimationMode.EASE_OUT_BOUNCE,
			//~ onComplete : () => {
			//~ Main.layoutManager._queueUpdateRegions();
			//~ }
		});
	};

	parseSpeed() {
		try {
			const [ok, content] = GLib.file_get_contents('/proc/net/dev');
			const lines = ByteArray.toString(content).split("\n").filter(
				s => s.indexOf(":") > 0 && s.indexOf("lo:") < 0);
			for (let i of lines) {
				const p = i.split(/\W+/);
				if (p[1] == 0)
					continue;
				if (lastDown == 0)
					lastDown = p[1];
				if (lastUp == 0)
					lastUp = p[9];
				speedDown = (p[1] - lastDown) / gapTime;
				speedUp = (p[9] - lastUp) / gapTime;
				lastDown = p[1];
				lastUp = p[9];
				if (xFloat.visible) {
					this._canvas.invalidate();
					this.verticalMove(xFloat);
				}
				break;
			}

		} catch (e) {
			log(e);
		}
	};

	shortStr(i) {
		let o;
		if (i > 1e9) {
			o = (i / 1e9).toFixed(1);
			return o + "GB/s";
		}
		if (i > 1e6) {
			o = (i / 1e6).toFixed(1);
			return o + "MB/s";
		}
		if (i > 1000) {
			o = (i / 1000).toFixed(1);
			return o + "KB/s";
		}
		return i.toFixed(0) + "B/s";
	};
});

class Extension {
	constructor(uuid) {
		this._uuid = uuid;

		ExtensionUtils.initTranslations();
	}

	enable() {
		this._indicator = new Indicator();
		Main.panel.addToStatusArea(this._uuid, this._indicator);
		timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, gapTime, () => {
			this._indicator.parseSpeed();
			return GLib.SOURCE_CONTINUE;
		});
		Main.layoutManager.addChrome(xFloat, {
			//~ affectsInputRegion : true,
			//~ trackFullscreen : true, //任何菜单导致Actor可见
		});
	}

	disable() {
		if (timeout) {
			GLib.source_remove(timeout);
			timeout = null;
		}
		Main.layoutManager.removeChrome(xFloat);
		this._indicator.destroy();
		this._indicator = null;
	}
}

function init(meta) { return new Extension(meta.uuid); }
