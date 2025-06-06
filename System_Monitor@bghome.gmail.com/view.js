"use strict";

import GObject from 'gi://GObject';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {panel as Panel} from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import * as FactoryModule from './factory.js';
import * as PrefsKeys from './prefs_keys.js';

export const Menu = GObject.registerClass(
class Menu extends PanelMenu.Button {
    constructor(extensionObject, settings) {
        let menuAlignment = 0.5;

        super(menuAlignment);

        this._layout = new St.BoxLayout();
        this._settings = settings;
        this._extensionObject = extensionObject;
        this._icons = {};
        this._meters = {};
        this._meter_widgets = {};
        this._event_handler_ids = [];
        this._indicator_sort_order = 1;
        this.available_meters = [PrefsKeys.CPU_METER, PrefsKeys.MEMORY_METER, PrefsKeys.STORAGE_METER, PrefsKeys.NETWORK_METER, PrefsKeys.SWAP_METER, PrefsKeys.LOAD_METER, PrefsKeys.GPU_METER];
        this._widget_area_container = FactoryModule.AbstractFactory.create('meter-area-widget');
        this._widget_area_container.actor.vertical = this._settings.get_string(PrefsKeys.LAYOUT) === 'vertical';
        this.menu.addMenuItem(this._widget_area_container);
        this._open_state_change_id = this.menu.connect('open-state-changed', (menu, is_open) => {
            for (let type in this._meter_widgets) {
                if (is_open) {
                    this._meter_widgets[type].freeze();
                } else {
                    this._meter_widgets[type].unfreeze();
                }
            }
        });
        this.add_child(this._layout);

        this._initIconsAndWidgets();
        this._addPositionSettingChangedHandler();
        this._addLayoutSettingChangedHandler();
        this._addMemoryCalculationSettingChangedHandler();
        this._addShowActivitySettingChangedHandler();
        this._addGPUTempUnitChangeHandler();
        this._addIndicatorToTopBar(this._settings.get_string(PrefsKeys.POSITION), extensionObject.metadata.uuid);
    }
    _initIconsAndWidgets() {
        for (let index in this.available_meters) {
            let type = this.available_meters[index];
            if (this._settings.get_boolean(type)) {
                let icon = this._createIcon(type);
                this._createMeterWidget(type, icon);
            }
            this._addSettingChangedHandler(type);
        }
    }
    _addIndicatorToTopBar(position, uuid) {
        Panel.addToStatusArea(uuid, this, this._indicator_sort_order, position);
        this._indicator_previous_position = position;
    }
    _moveIndicatorOnTopBar(position) {
        // Gnome does not provide a method to remove indicator (opposite to addToStatusArea() method), so this is a workaround.
        switch (this._indicator_previous_position) {
            case 'left':
                Panel._leftBox.remove_actor(this.container);
                break;
            case 'center':
                Panel._centerBox.remove_actor(this.container);
                break;
            case 'right':
                Panel._rightBox.remove_actor(this.container);
                break;
            default:
                throw new Error('Unknown position given: ' + this._indicator_previous_position);
        }

        switch (position) {
            case 'left':
                Panel._leftBox.insert_child_at_index(this.container, this._indicator_sort_order);
                break;
            case 'center':
                Panel._centerBox.insert_child_at_index(this.container, this._indicator_sort_order);
                break;
            case 'right':
                Panel._rightBox.insert_child_at_index(this.container, this._indicator_sort_order);
                break;
            default:
                throw new Error('Unknown position given: ' + position);
        }

        this._indicator_previous_position = position;
    }
    _createIcon(type) {
        let can_show_activity = this._settings.get_boolean(PrefsKeys.SHOW_ACTIVITY);
        let icon = FactoryModule.AbstractFactory.create('icon', type, {}, can_show_activity, this._extensionObject);
        let meter = this._meters[type];

        if (meter == undefined) {
            switch (type) {
                case PrefsKeys.MEMORY_METER:
                    meter = FactoryModule.AbstractFactory.create('meter', type, {
                        calculation_method: this._settings.get_string(PrefsKeys.MEMORY_CALCULATION_METHOD),
                        activity_threshold: 1
                    });
                    break;
                case PrefsKeys.NETWORK_METER:
                    meter = FactoryModule.AbstractFactory.create('meter', type, {
                        refresh_interval: this._settings.get_int(PrefsKeys.REFRESH_INTERVAL),
                        activity_threshold: 10
                    });
                    break;
                case PrefsKeys.GPU_METER:
                    var temp_unit = (this._settings.get_string(PrefsKeys.TEMPRATURE_UNIT) === 'C') ? Util.CELSIUS : Util.FAHRENHEIT;
                    
                    meter = FactoryModule.AbstractFactory.create('meter', type, {
                        refresh_interval: this._settings.get_int(PrefsKeys.REFRESH_INTERVAL),
                        temp_unit: temp_unit,
                        activity_threshold: 10
                    });
                    break;
                default:
                    meter = FactoryModule.AbstractFactory.create('meter', type);
            }
            this._meters[type] = meter;
        }

        meter.addObserver(icon);
        this._layout.insert_child_at_index(icon, this.available_meters.indexOf(type));
        this._icons[type] = icon;
        return FactoryModule.AbstractFactory.create('icon', type, {}, can_show_activity, this._extensionObject);
    }
    _destroyIcon(type) {
        let icon = this._icons[type];
        this._meters[type].removeObserver(icon);
        this._layout.remove_child(icon);
        icon.destroy();
        delete this._icons[type];
        delete this._meters[type];
    }
    _addSettingChangedHandler(type) {
        let that = this;
        let event_id = this._settings.connect('changed::' + type, function(settings, key) {
            let is_enabled = settings.get_boolean(key);
            if (is_enabled) {
                let icon = that._createIcon(type);
                that._createMeterWidget(type, icon);
            } else {
                that._destroyMeterWidget(type);
                that._destroyIcon(type);
            }
        });
        this._event_handler_ids.push(event_id);
    }
    _addPositionSettingChangedHandler() {
        let that = this;
        let event_id = this._settings.connect('changed::' + PrefsKeys.POSITION, function(settings, key) {
            that._moveIndicatorOnTopBar(settings.get_string(key));
        });
        this._event_handler_ids.push(event_id);
    }
    _addLayoutSettingChangedHandler() {
        let that = this;
        let event_id = this._settings.connect('changed::' + PrefsKeys.LAYOUT, function(settings, key) {
            let isVertical = 'vertical' === settings.get_string(key);
            that._widget_area_container.actor.vertical = isVertical;
        });
        this._event_handler_ids.push(event_id);
    }
    _addMemoryCalculationSettingChangedHandler() {
        let that = this;
        let event_id = this._settings.connect('changed::' + PrefsKeys.MEMORY_CALCULATION_METHOD, function(settings, key) {
            // Reload the memory meter if it's enabled.
            let type = PrefsKeys.MEMORY_METER;
            if (settings.get_boolean(type)) {
                that._destroyMeterWidget(type);
                that._destroyIcon(type);
                let icon = that._createIcon(type);
                that._createMeterWidget(type, icon);
            }
        });
        this._event_handler_ids.push(event_id);
    }
    _addGPUTempUnitChangeHandler() {
        let that = this;
        let event_id = this._settings.connect('changed::' + PrefsKeys.TEMPRATURE_UNIT, function (settings, key) {
            let type = PrefsKeys.GPU_METER;

            if (settings.get_boolean(type)) {
                that._destroyIcon(type);
                that._destroyMeterWidget(type);
                let icon = that._createIcon(type);
                that._createMeterWidget(type, icon);
            }
        });
        this._event_handler_ids.push(event_id);
    }
    _addShowActivitySettingChangedHandler() {
        let event_id = this._settings.connect('changed::' + PrefsKeys.SHOW_ACTIVITY, this._handleActivityChange.bind(this));
        this._event_handler_ids.push(event_id);
    }
    _handleActivityChange(settings, key) {
        let meters = this._meters;
        for (let type in meters) {
            this._destroyMeterWidget(type);
            this._destroyIcon(type);
        }

        this._initIconsAndWidgets();
    }
    _removeAllSettingChangedHandlers() {
        for (let index in this._event_handler_ids) {
            this._settings.disconnect(this._event_handler_ids[index]);
        }
        this._event_handler_ids = [];
    }
    _createMeterWidget(type, icon) {
        let meter_widget = FactoryModule.AbstractFactory.create('meter-widget', type, icon);
        this._meter_widgets[type] = meter_widget;
        this._widget_area_container.addMeter(meter_widget, this.available_meters.indexOf(type));
        this._meters[type].addObserver(meter_widget);
    }
    _destroyMeterWidget(type) {
        let meter_widget = this._meter_widgets[type];
        this._meters[type].removeObserver(meter_widget);
        this._widget_area_container.removeMeter(meter_widget);
        meter_widget.destroy();
        delete this._meter_widgets[type];
    }
    destroy() {
        let meters = this._meters;
        for (let type in meters) {
            meters[type].destroy();
            this._destroyMeterWidget(type);
            this._destroyIcon(type);
        }

        this._removeAllSettingChangedHandlers();
        if (this._open_state_change_id) {
            this.menu.disconnect(this._open_state_change_id);
        }
        super.destroy();
    }
    updateUi() {
        let meters = this._meters;
        for (let type in meters) {
            meters[type].notifyAll();
        }
        return true;
    }
});
