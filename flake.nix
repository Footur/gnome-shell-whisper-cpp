{
  description = "GNOME Shell whisper.cpp extension";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forAllSystems = function:
        nixpkgs.lib.genAttrs systems (system: function (import nixpkgs { inherit system; }));
    in
    {
      packages = forAllSystems (pkgs: {
        default = pkgs.stdenvNoCC.mkDerivation {
          pname = "gnome-shell-whisper-cpp";
          version = "unstable";
          src = self;
          nativeBuildInputs = [ pkgs.glib ];
          dontUnpack = true;

          installPhase = ''
            extensionDir="$out/share/gnome-shell/extensions/gnome-shell-whisper-cpp@local"
            mkdir -p "$extensionDir/schemas"
            cp "$src/extension.js" "$src/prefs.js" "$src/metadata.json" "$extensionDir/"
            cp "$src"/schemas/*.gschema.xml "$extensionDir/schemas/"
            glib-compile-schemas --strict "$extensionDir/schemas"
          '';

          meta = {
            description = "GNOME Shell extension for push-to-talk transcription with whisper.cpp";
            platforms = pkgs.lib.platforms.linux;
          };
        };
      });

      nixosModules.default = { pkgs, ... }: {
        environment.systemPackages = [ self.packages.${pkgs.system}.default ];
      };
    };
}
