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
"use strict";

const {Gio, GObject} = imports.gi;

const QuickSettings = imports.ui.quickSettings;

// This is the live instance of the Quick Settings menu
const QuickSettingsMenu = imports.ui.main.panel.statusArea.quickSettings;


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
        log(`Setting brightness to ${brightness}`);
        this._proxy.SetBrightnessSync(brightness);
    }

    getMaxBrightness() {
        return this._proxy.GetMaxBrightnessSync();
    }
}


const FeatureIndicator = GObject.registerClass(
    class FeatureIndicator extends QuickSettings.SystemIndicator {
        _init() {
            super._init();

            // Create the slider and associate it with the indicator, being sure to
            // destroy it along with the indicator
            this.quickSettingsItems.push(new FeatureSlider());

            this.connect('destroy', () => {
                this.quickSettingsItems.forEach(item => item.destroy());
            });

            // Add the indicator to the panel
            QuickSettingsMenu._indicators.add_child(this);


            // Add the slider to the menu, passing `2` as the second
            // argument to ensure the slider spans both columns of the menu
            QuickSettingsMenu._addItems(this.quickSettingsItems, 2);
        }
    });

const FeatureSlider = GObject.registerClass(
    class FeatureSlider extends QuickSettings.QuickSlider {
        _init() {
            super._init({
                iconName: 'keyboard-brightness-symbolic',
            });

            this._sliderChangedId = this.slider.connect('notify::value',
                this._onSliderChanged.bind(this));

            this.slider.accessible_name = 'Keyboard Brightness';

            // create instance of KbpBrightnessProxy
            this._proxy = new KbdBrightnessProxy((proxy, error) => {
                if (error) throw error;
                // proxy.connectSignal('BrightnessChanged', this._sync.bind(this));
                // this._sync();
            });
        }

        _onSliderChanged() {
            this._proxy.Brightness = this.slider.value;
        }
    });

class Extension {
    constructor() {
        this._indicator = null;
    }

    enable() {
        this._indicator = new FeatureIndicator();
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}

function init() {
    return new Extension();
}