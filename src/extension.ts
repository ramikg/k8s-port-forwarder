import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import Clutter from 'gi://Clutter';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import type {Resource, Directory} from './types.js';
import {type ResourceKey, getResourceKey, ProcessManager} from './process-management.js';
import {LogDialog} from './log-dialog.js';

const PLAY_ICON = 'media-playback-start-symbolic';
const PAUSE_ICON = 'media-playback-pause-symbolic';
const LOG_ICON = 'utilities-terminal-symbolic';

type DirectoryState = Directory & {
    menu: PopupMenu.PopupSubMenuMenuItem;
    activeLabel: St.Label;
    numberOfActiveResources: number;
    playAllButton: St.Button;
    pauseAllButton: St.Button;
};

const Indicator = GObject.registerClass(
    class IndicatorInner extends PanelMenu.Button {
        declare _processManager: ProcessManager;
        declare _logDialog: LogDialog;
        declare _resourceButtons: Map<ResourceKey, St.Button>;
        declare _icon: St.Icon;
        declare _configurationMenu: PopupMenu.PopupMenu | null;
        declare onConfigurationClick: (() => void) | null;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        _init(...args: any[]) {
            super._init(...args);

            this.set_style('-natural-hpadding: 4px; -minimum-hpadding: 4px;');
            this._icon = new St.Icon({
                style_class: 'system-status-icon',
            });
            this.add_child(this._icon);

            this._processManager = new ProcessManager();
            this._logDialog = new LogDialog(this._processManager);
            this._resourceButtons = new Map();
            this.onConfigurationClick = null;

            this._configurationMenu = new PopupMenu.PopupMenu(this, 0.5, St.Side.TOP);
            Main.layoutManager.uiGroup.add_child(this._configurationMenu.actor);
            this._configurationMenu.actor.hide();

            const configurationItem = new PopupMenu.PopupMenuItem('Configuration');
            const configurationIcon = new St.Icon({
                icon_name: 'preferences-system-symbolic',
                style_class: 'popup-menu-icon',
            });
            configurationItem.insert_child_below(
                configurationIcon,
                configurationItem.label
            );
            configurationItem.connect('activate', () => {
                this._configurationMenu?.close();
                this.onConfigurationClick?.();
            });
            this._configurationMenu.addMenuItem(configurationItem);
        }

        vfunc_event(event: Clutter.Event): boolean {
            if (
                event.type() === Clutter.EventType.BUTTON_PRESS &&
                event.get_button() === Clutter.BUTTON_SECONDARY
            ) {
                this._configurationMenu?.toggle();
                return Clutter.EVENT_STOP;
            }
            return super.vfunc_event(event);
        }

        setIconPath(extensionPath: string) {
            this._icon.gicon = Gio.icon_new_for_string(
                `${extensionPath}/resources/icon-symbolic.svg`
            );
        }

        rebuildMenu(directories: Directory[]) {
            this.destroyAllProcesses();
            (this.menu as PopupMenu.PopupMenu).removeAll();
            this._resourceButtons.clear();

            for (const directory of directories) this._buildDirectoryMenu(directory);
        }

        _buildDirectoryMenu(directory: Directory) {
            const menu = new PopupMenu.PopupSubMenuMenuItem(directory.displayName);

            const activeLabel = new St.Label({
                text: `0/${directory.resources.length}`,
            });
            menu.add_child(activeLabel);
            const directoryControls = new St.BoxLayout({vertical: false});
            const playAllButton = this._createIconButton(PLAY_ICON);
            const pauseAllButton = this._createIconButton(PAUSE_ICON);
            const directoryState: DirectoryState = {
                ...directory,
                menu,
                activeLabel,
                numberOfActiveResources: 0,
                playAllButton,
                pauseAllButton,
            };
            playAllButton.connect('clicked', () => {
                for (const resource of directoryState.resources)
                    this._startResource(directoryState, resource);
            });
            pauseAllButton.connect('clicked', () => {
                for (const resource of directoryState.resources)
                    this._stopResource(directoryState, resource);
            });
            directoryControls.add_child(playAllButton);
            directoryControls.add_child(pauseAllButton);
            menu.add_child(directoryControls);

            for (const resource of directoryState.resources)
                this._buildResourceMenuItem(directoryState, resource);

            this._updateDirectoryControls(directoryState);

            (this.menu as PopupMenu.PopupMenu).addMenuItem(menu);
        }

        _buildResourceMenuItem(directoryState: DirectoryState, resource: Resource) {
            const menuItem = new PopupMenu.PopupMenuItem(resource.name);
            const controlsBox = new St.BoxLayout({
                vertical: false,
                x_expand: true,
            });
            controlsBox.add_child(new St.Widget({x_expand: true}));
            const logButton = this._createIconButton(LOG_ICON);
            logButton.style = 'margin-right: 4px;';
            logButton.connect('clicked', () => {
                this._logDialog.show(getResourceKey(resource));
                (this.menu as PopupMenu.PopupMenu).close();
            });
            controlsBox.add_child(logButton);
            const toggleButton = this._createResourceToggleButton(
                directoryState,
                resource
            );
            controlsBox.add_child(toggleButton);
            menuItem.add_child(controlsBox);
            this._resourceButtons.set(getResourceKey(resource), toggleButton);
            directoryState.menu.menu.addMenuItem(menuItem);
        }

        _createIconButton(iconName: string) {
            return new St.Button({
                reactive: true,
                can_focus: true,
                child: new St.Icon({
                    icon_name: iconName,
                    style_class: 'popup-menu-icon',
                }),
                style_class: 'system-menu-action',
            });
        }

        _createResourceToggleButton(directoryState: DirectoryState, resource: Resource) {
            const button = this._createIconButton(PLAY_ICON);
            button.connect('clicked', () => {
                const resourceKey = getResourceKey(resource);
                if (this._processManager.state.get(resourceKey)?.process)
                    this._stopResource(directoryState, resource);
                else this._startResource(directoryState, resource);
            });
            return button;
        }

        _updateExtensionIcon() {
            const hasRunningProcesses = [...this._processManager.state.values()].some(
                processState => processState.process
            );

            this._icon.style = hasRunningProcesses ? 'color: #4caf50;' : '';
        }

        _updateActiveLabel(directoryState: DirectoryState) {
            directoryState.activeLabel.text = `${directoryState.numberOfActiveResources}/${directoryState.resources.length}`;
        }

        _setDirectoryButton(button: St.Button, enabled: boolean) {
            button.reactive = enabled;
            button.can_focus = enabled;
            button.opacity = enabled ? 255 : 64;
        }

        _updateDirectoryControls(directoryState: DirectoryState) {
            const active = directoryState.numberOfActiveResources;
            const total = directoryState.resources.length;
            this._setDirectoryButton(directoryState.playAllButton, active < total);
            this._setDirectoryButton(directoryState.pauseAllButton, active > 0);
        }

        _setButtonIcon(resource: Resource, iconName: string) {
            const button = this._resourceButtons.get(getResourceKey(resource));
            if (button) (button.child as St.Icon).icon_name = iconName;
        }

        _startResource(directoryState: DirectoryState, resource: Resource) {
            const resourceKey = getResourceKey(resource);
            if (this._processManager.state.get(resourceKey)?.process) return;

            this._processManager.clearResourceState(resourceKey);

            const process = this._processManager.spawnPortForward(resource, () =>
                this._stopResource(directoryState, resource)
            );
            if (process) {
                directoryState.numberOfActiveResources += 1;
                this._updateActiveLabel(directoryState);
                this._updateDirectoryControls(directoryState);
                this._updateExtensionIcon();
                this._setButtonIcon(resource, PAUSE_ICON);
            }
        }

        _stopResource(directoryState: DirectoryState, resource: Resource) {
            const resourceKey = getResourceKey(resource);
            const processState = this._processManager.state.get(resourceKey);
            if (!processState?.process) return;

            processState.process.force_exit();
            processState.process = null;
            this._processManager.addExitMessage(resourceKey);
            directoryState.numberOfActiveResources -= 1;
            this._updateActiveLabel(directoryState);
            this._updateDirectoryControls(directoryState);
            this._updateExtensionIcon();
            this._setButtonIcon(resource, PLAY_ICON);
        }

        destroyAllProcesses() {
            this._logDialog.close();
            this._processManager.destroyAllProcesses();
            this._updateExtensionIcon();
        }

        destroy() {
            if (this._configurationMenu) {
                Main.panel.menuManager.removeMenu(this._configurationMenu);
                this._configurationMenu.destroy();
                this._configurationMenu = null;
            }
            super.destroy();
        }
    }
);

export default class KubernetesPortForwardExtension extends Extension {
    _indicator: InstanceType<typeof Indicator> | null = null;
    _settings: Gio.Settings | null = null;
    _settingsChangedId: number = 0;
    _screenSaverSubscriptionId: number | null = null;

    _loadDirectories(): Directory[] {
        if (!this._settings) return [];
        try {
            const directories: Directory[] = JSON.parse(
                this._settings.get_string('directories')
            );
            for (const directory of directories) {
                directory.resources.forEach(resource => {
                    resource.context = directory.context;
                });
            }
            return directories;
        } catch {
            return [];
        }
    }

    enable() {
        this._settings = this.getSettings();
        this._indicator = new Indicator(0.0, 'Kubernetes Port-Forward');
        this._indicator.setIconPath(this.path);
        this._indicator.onConfigurationClick = () => this.openPreferences();
        this._indicator.rebuildMenu(this._loadDirectories());
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        if (this._indicator._configurationMenu)
            // Should be called after `addToStatusArea`. Otherwise, hovering over the extension icon
            // when another extension's menu is open would open the configuration menu.
            Main.panel.menuManager.addMenu(this._indicator._configurationMenu);

        this._settingsChangedId = this._settings.connect('changed::directories', () => {
            this._indicator?.rebuildMenu(this._loadDirectories());
        });

        this._screenSaverSubscriptionId = Gio.DBus.session.signal_subscribe(
            null,
            'org.gnome.ScreenSaver',
            'ActiveChanged',
            '/org/gnome/ScreenSaver',
            null,
            Gio.DBusSignalFlags.NONE,
            (_connection, _sender, _path, _iface, _signal, params) => {
                const active = params.get_child_value(0).get_boolean();
                if (this._indicator) this._indicator.container.visible = !active;
            }
        );
    }

    disable() {
        // The extension uses unlock-dialog to avoid the port-forward processes from being killed when the user locks the screen. (Not very useful otherwise.)
        // The signal subscription is used to hide the extension's icon from the lock screen, as we don't want the user to be able to control it from there.
        if (this._screenSaverSubscriptionId != null) {
            Gio.DBus.session.signal_unsubscribe(this._screenSaverSubscriptionId);
            this._screenSaverSubscriptionId = null;
        }
        if (this._settings && this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        this._indicator?.destroyAllProcesses();
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }
}
