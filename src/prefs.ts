import Adw from "gi://Adw";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";
import type { Resource, Directory } from "./types.js";

export default class K8sPortForwarderPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow) {
        const settings = this.getSettings();
        (window as any)._settings = settings;

        let directories: Directory[];
        try {
            directories = JSON.parse(settings.get_string("directories"));
        } catch {
            directories = [];
        }

        let currentPage: Adw.PreferencesPage | null = null;

        const save = () =>
            settings.set_string("directories", JSON.stringify(directories));

        const createPortRow = (title: string, value: number) =>
            new Adw.SpinRow({
                title,
                numeric: true,
                adjustment: new Gtk.Adjustment({
                    lower: 1,
                    upper: 65535,
                    step_increment: 1,
                    value,
                }),
            });

        const rebuild = () => {
            if (currentPage) {
                window.remove(currentPage);
            }

            currentPage = new Adw.PreferencesPage({
                title: "Directories",
                icon_name: "network-server-symbolic",
            });

            const group = new Adw.PreferencesGroup();

            for (
                let directoryIndex = 0;
                directoryIndex < directories.length;
                directoryIndex++
            )
                buildDirectoryExpander(
                    group,
                    directories[directoryIndex],
                    directoryIndex,
                );

            const addDirectoryRow = new Adw.ActionRow({
                title: "Add Directory",
                activatable: true,
            });
            addDirectoryRow.add_prefix(
                new Gtk.Image({ icon_name: "list-add-symbolic" }),
            );
            addDirectoryRow.connect("activated", () => {
                directories.push({
                    displayName: "new-directory",
                    context: "",
                    resources: [],
                });
                save();
                rebuild();
            });
            group.add(addDirectoryRow);

            currentPage.add(group);
            window.add(currentPage);
        };

        const buildDirectoryExpander = (
            group: Adw.PreferencesGroup,
            directory: Directory,
            directoryIndex: number,
        ) => {
            const expander = new Adw.ExpanderRow({
                title: directory.displayName,
                subtitle: `${directory.resources.length} resource${directory.resources.length !== 1 ? "s" : ""}`,
            });

            const deleteDirBtn = new Gtk.Button({
                icon_name: "user-trash-symbolic",
                valign: Gtk.Align.CENTER,
                css_classes: ["flat", "circular"],
            });
            deleteDirBtn.connect("clicked", () => {
                directories.splice(directoryIndex, 1);
                save();
                rebuild();
            });
            expander.add_suffix(deleteDirBtn);

            const displayNameRow = new Adw.EntryRow({
                title: "Display Name",
                text: directory.displayName,
            });
            displayNameRow.connect("changed", () => {
                directory.displayName = displayNameRow.get_text();
                expander.set_title(directory.displayName);
                save();
            });
            expander.add_row(displayNameRow);

            const contextRow = new Adw.EntryRow({
                title: "Context",
                text: directory.context,
            });
            contextRow.connect("changed", () => {
                directory.context = contextRow.get_text();
                save();
            });
            expander.add_row(contextRow);

            for (
                let resourceIndex = 0;
                resourceIndex < directory.resources.length;
                resourceIndex++
            )
                buildResourceRow(
                    expander,
                    directory,
                    directory.resources[resourceIndex],
                    resourceIndex,
                );

            const addResourceRow = new Adw.ActionRow({
                title: "Add Resource",
                activatable: true,
            });
            addResourceRow.add_prefix(
                new Gtk.Image({ icon_name: "list-add-symbolic" }),
            );
            addResourceRow.connect("activated", () => {
                showAddResourceDialog(directory);
            });
            expander.add_row(addResourceRow);

            group.add(expander);
        };

        const showAddResourceDialog = (directory: Directory) => {
            const dialog = new Adw.AlertDialog({
                heading: "Add Resource",
            });
            dialog.add_response("cancel", "Cancel");
            dialog.add_response("add", "Add");
            dialog.set_response_appearance(
                "add",
                Adw.ResponseAppearance.SUGGESTED,
            );
            dialog.set_default_response("add");
            dialog.set_close_response("cancel");

            const content = new Adw.PreferencesGroup();

            const nameRow = new Adw.EntryRow({
                title: "Name",
                text: "new-resource",
            });
            content.add(nameRow);

            const typeRow = new Adw.EntryRow({
                title: "Type",
                text: "service",
            });
            content.add(typeRow);

            const namespaceRow = new Adw.EntryRow({
                title: "Namespace",
                text: "default",
            });
            content.add(namespaceRow);

            const localPortRow = createPortRow("Local Port", 8080);
            content.add(localPortRow);

            const remotePortRow = createPortRow("Remote Port", 8080);
            content.add(remotePortRow);

            dialog.set_extra_child(content);

            dialog.connect(
                "response",
                (_dialog: Adw.AlertDialog, response: string) => {
                    if (response === "add") {
                        directory.resources.push({
                            context: directory.context,
                            type: typeRow.get_text(),
                            namespace: namespaceRow.get_text(),
                            name: nameRow.get_text(),
                            localPort: Math.round(localPortRow.get_value()),
                            remotePort: Math.round(remotePortRow.get_value()),
                        });
                        save();
                        rebuild();
                    }
                },
            );
            dialog.present(window);
        };

        const buildResourceRow = (
            parent: Adw.ExpanderRow,
            directory: Directory,
            resource: Resource,
            resourceIndex: number,
        ) => {
            const expander = new Adw.ExpanderRow({
                title: resource.name,
                subtitle: `${resource.type} — ${resource.namespace} — ${resource.localPort}:${resource.remotePort}`,
            });

            const updateSubtitle = () => {
                expander.set_subtitle(
                    `${resource.type} — ${resource.namespace} — ${resource.localPort}:${resource.remotePort}`,
                );
            };

            const deleteBtn = new Gtk.Button({
                icon_name: "user-trash-symbolic",
                valign: Gtk.Align.CENTER,
                css_classes: ["flat", "circular"],
            });
            deleteBtn.connect("clicked", () => {
                directory.resources.splice(resourceIndex, 1);
                save();
                rebuild();
            });
            expander.add_suffix(deleteBtn);

            const nameRow = new Adw.EntryRow({
                title: "Name",
                text: resource.name,
            });
            nameRow.connect("changed", () => {
                resource.name = nameRow.get_text();
                expander.set_title(resource.name);
                updateSubtitle();
                save();
            });
            expander.add_row(nameRow);

            const typeRow = new Adw.EntryRow({
                title: "Type",
                text: resource.type,
            });
            typeRow.connect("changed", () => {
                resource.type = typeRow.get_text();
                updateSubtitle();
                save();
            });
            expander.add_row(typeRow);

            const namespaceRow = new Adw.EntryRow({
                title: "Namespace",
                text: resource.namespace,
            });
            namespaceRow.connect("changed", () => {
                resource.namespace = namespaceRow.get_text();
                updateSubtitle();
                save();
            });
            expander.add_row(namespaceRow);

            const localPortRow = createPortRow(
                "Local Port",
                resource.localPort,
            );
            localPortRow.connect("notify::value", () => {
                resource.localPort = Math.round(localPortRow.get_value());
                updateSubtitle();
                save();
            });
            expander.add_row(localPortRow);

            const remotePortRow = createPortRow(
                "Remote Port",
                resource.remotePort,
            );
            remotePortRow.connect("notify::value", () => {
                resource.remotePort = Math.round(remotePortRow.get_value());
                updateSubtitle();
                save();
            });
            expander.add_row(remotePortRow);

            parent.add_row(expander);
        };

        rebuild();
    }
}
