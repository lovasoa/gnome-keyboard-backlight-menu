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

const GETTEXT_DOMAIN = 'keyboard-backlight-menu';

const { Gio, GLib, GObject, St } = imports.gi;

const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;

function setTimeout(func, delay, ...args) {
    return GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
        func(...args);
        return GLib.SOURCE_REMOVE;
    });
};

function clearTimeout(timeout) { GLib.source_remove(timeout); };

class KbdBrightnessProxy {
    constructor(callback) {
        const BrightnessProxy = Gio.DBusProxy.makeProxyWrapper(`
            <node>
            <interface name="org.freedesktop.UPower.KbdBacklight">
                <method name="SetBrightness">
                    <arg name="value" type="i" direction="in"/>
                </method>
                <method name="GetBrightness">
                    <arg name="value" type="i" direction="out"/>
                </method>
                <method name="GetMaxBrightness">
                    <arg name="value" type="i" direction="out"/>
                </method>
                <signal name="BrightnessChanged">
                    <arg type="i"/>
                </signal>
            </interface>
            </node>`);
        this._proxy = new BrightnessProxy(
            Gio.DBus.system,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower/KbdBacklight',
            callback);
    }

    get Brightness() {
        return this._proxy.GetBrightnessSync() / this.getMaxBrightness();
    }

    set Brightness(value) {
        const brightness = Math.round(value * this.getMaxBrightness());
        this._proxy.SetBrightnessSync(brightness);
    }

    getMaxBrightness() {
        return this._proxy.GetMaxBrightnessSync();
    }
}

const _ = ExtensionUtils.gettext;

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.SystemIndicator {
        _init() {
            super._init();
            this._proxy = new KbdBrightnessProxy((proxy, error) => {
                if (error) throw error;
                proxy.connectSignal('BrightnessChanged', this._sync.bind(this));
                this._sync();
            });

            this._item = new PopupMenu.PopupBaseMenuItem({ activate: false });
            this.menu.addMenuItem(this._item);

            this._slider = new Slider.Slider(0);
            this._sliderChangedId = this._slider.connect('notify::value',
                this._sliderChanged.bind(this));
            this._slider.accessible_name = _("Keyboard brightness");

            let icon = new St.Icon({
                icon_name: 'keyboard-brightness-symbolic',
                style_class: 'popup-menu-icon'
            });
            this._item.add(icon);
            this._item.add_child(this._slider);
            this._item.connect('button-press-event', (actor, event) => {
                return this._slider.startDragging(event);
            });
            this._item.connect('key-press-event', (actor, event) => {
                return this._slider.emit('key-press-event', event);
            });
            this._item.connect('scroll-event', (actor, event) => {
                return this._slider.emit('scroll-event', event);
            });
            this.lastChange = Date.now();
            this.changeSliderTimeout = null;
        }

        _sliderChanged() {
            this.lastChange = Date.now();
            this._proxy.Brightness = this._slider.value;
        }

        _changeSlider(value) {
            this._slider.block_signal_handler(this._sliderChangedId);
            this._slider.value = value;
            this._slider.unblock_signal_handler(this._sliderChangedId);
        }

        _sync() {
            let visible = this._proxy.Brightness >= 0;
            this._item.visible = visible;
            if (visible) {
                if (this.changeSliderTimeout) clearTimeout(this.changeSliderTimeout);
                let dt = this.lastChange + 1000 - Date.now();
                if (dt < 0) dt = 0;
                this.changeSliderTimeout = setTimeout(_ => this._changeSlider(this._proxy.Brightness), dt);
            }
        }
    });

class Extension {
    constructor(uuid) {
        this._uuid = uuid;
        ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    }

    enable() {
        this._indicator = new Indicator();
        Main.panel.statusArea.aggregateMenu.menu.addMenuItem(this._indicator.menu, 2);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}

function init(meta) {
    return new Extension(meta.uuid);
}
