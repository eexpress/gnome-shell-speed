/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

const GETTEXT_DOMAIN = 'my-indicator-extension';

const {GObject, St, GLib, Clutter, PangoCairo, Pango} = imports.gi;

const Gettext = imports.gettext.domain(GETTEXT_DOMAIN);
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const ByteArray = imports.byteArray;
const Cairo		 = imports.cairo;

let monitor = Main.layoutManager.primaryMonitor;
let lastDown = 0, lastUp = 0;
let speedDown = 0, speedUp = 0;
let timeout;
let speedText = '';
const gapTime = 3;
let xFloat;
let size = 100;
const sMax = 1000000; //最高为1MB/s
const mcolor = 'green';

const Indicator =
    GObject.registerClass(class Indicator extends PanelMenu.Button {
      _init() {
        super._init(0.0, _('My Shiny Indicator'));

        this.add_child(new St.Icon({
          icon_name : 'face-smile-symbolic',
          style_class : 'system-status-icon',
        }));
        this.background_color = Clutter.Color.from_string(mcolor)[1];

        this.connect("button-press-event", (actor, event) => {
          xFloat.visible = !xFloat.visible;
          this.background_color =
              Clutter.Color.from_string(xFloat.visible ? mcolor : "black")[1];
        });

        //~ xFloat = new Clutter.Actor({
        xFloat = new St.Bin({
          //~ style : 'background-color: '+mcolor,
          reactive : true,
          //~ can_focus : true,
          //~ track_hover : true,
          width : size,
          height : size,
        });

        this._canvas = new Clutter.Canvas();
        this._canvas.connect('draw', this.on_draw.bind(this));
        this._canvas.invalidate();
        this._canvas.set_size(size, size);
        xFloat.set_size(size, size);
        xFloat.set_content(this._canvas);
        this._canvas.invalidate();

        xFloat.set_position(monitor.width - size,
                            monitor.height - size); // left-down corner.

        xFloat.connect("button-press-event",
                       (a) => { this.horizontalMove(a); });

      }

      setcolor(ctx, colorstr, alpha) {
        const [, cc] = Clutter.Color.from_string(colorstr);
        ctx.setSourceRGBA(cc.red, cc.green, cc.blue, alpha);
      }

      on_draw(canvas, ctx, width, height) {
        ctx.setOperator(Cairo.Operator.CLEAR);
        ctx.paint();

        ctx.setOperator(Cairo.Operator.SOURCE);
        ctx.translate(size / 2, size / 2);
        this.setcolor(ctx, mcolor, 0.8); //底色
        ctx.arc(0, 0, size / 2 - size / 20, 0, 2 * Math.PI);
        ctx.fill();

        this.setcolor(ctx, "white", 1);
      //  ctx.showText(speedText); // 会卡死！！
        //~ const font = "DejaVuSerif Bold 11";
        //~ let pl = PangoCairo.create_layout(ctx);
        //~ pl.set_text(speedText, -1);
        //~ pl.set_text("sss", -1);
        //~ pl.set_font_description(Pango.FontDescription.from_string(font));
        //~ PangoCairo.update_layout(ctx, pl);
        //~ let [w, h] = pl.get_pixel_size();
        //~ ctx.moveTo(-w / 2, 0); //?????????
        //~ PangoCairo.show_layout(ctx, pl);
        canvas.invalidate();
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
          onComplete : () => {}
        });
      };

      verticalMove(a) {
        let r = speedDown;
        if (r > sMax)  r = sMax;
        const h = Math.sin(r * Math.PI / 2 / sMax); // sin的x轴最高点是y=Pi/2
        let newY = (monitor.height - size) * h;
        log("newY: "+newY);
        //~ log(speedDown+"--"+r+"--"+h+"--"+newY);
        //~ log(newY);
        //~ a.ease({
          //~ y : newY,
          //~ duration : 1000,
          //~ mode : Clutter.AnimationMode.EASE_OUT_BOUNCE,
          //~ onComplete : () => {}
        //~ });
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
            //~ log("----------------------");
            //~ log(p[0]+" -- "+p[1]+" -- "+p[9]);
            if (lastDown == 0)
              lastDown = p[1];
            if (lastUp == 0)
              lastUp = p[9];
            speedDown = (p[1] - lastDown) / gapTime;
            speedUp = (p[9] - lastUp) / gapTime;
            lastDown = p[1];
            lastUp = p[9];
            speedText = "⬇ " + this.shortStr(speedDown) + "\n⬆ " +
                        this.shortStr(speedUp);
            //~ log(speedDown+" - "+speedText);
            //~ log(speedDown);
            if (xFloat.visible)
              this.verticalMove(xFloat);
            break;
          }

        } catch (e) {
          log(e);
        }
      };

      shortStr(i) {
        let o;
        if (i > 1000000000) {
          o = (i / 1000000000).toFixed(2);
          return o + "GB/s";
        }
        if (i > 1000000) {
          o = (i / 1000000).toFixed(2);
          return o + "MB/s";
        }
        if (i > 1000) {
          o = (i / 1000).toFixed(2);
          return o + "KB/s";
        }
        return i.toFixed(2) + "B/s";
      };
    });

class Extension {
  constructor(uuid) {
    this._uuid = uuid;

    ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
  }

  enable() {
    this._indicator = new Indicator();
    Main.panel.addToStatusArea(this._uuid, this._indicator);
    timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, gapTime, () => {
      this._indicator.parseSpeed();
      return GLib.SOURCE_CONTINUE;
    });
    Main.layoutManager.addChrome(xFloat, {
      affectsInputRegion : true,
      trackFullscreen : true,
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
