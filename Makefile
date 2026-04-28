NAME=k8s-port-forwarder@ramikg

.PHONY: all pack install dev clean

all: dist/extension.js

node_modules/.package-lock.json: package.json
	npm install

dist/extension.js: node_modules/.package-lock.json src/*.ts
	npm run build

$(NAME).zip: dist/extension.js metadata.json resources/icon-symbolic.svg schemas/*.gschema.xml
	@cp metadata.json dist/
	@mkdir -p dist/resources
	@cp resources/icon-symbolic.svg dist/resources/
	@mkdir -p dist/schemas
	@cp schemas/*.gschema.xml dist/schemas/
	@(cd dist && zip ../$(NAME).zip -9r .)

pack: $(NAME).zip

install: $(NAME).zip
	gnome-extensions install --force $(NAME).zip
	gnome-extensions enable $(NAME)

dev: install
	@gnome_shell_version=$$(gnome-shell --version | awk '{print $$3}' | cut -d. -f1); \
	if [ "$$gnome_shell_version" -lt 49 ]; then flag=--nested; else flag=--devkit; fi; \
	dbus-run-session -- gnome-shell $$flag --wayland

clean:
	@rm -rf dist node_modules $(NAME).zip
