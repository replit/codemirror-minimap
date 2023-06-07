{ pkgs }: {
	deps = [
    pkgs.nodePackages.pnpm
		pkgs.nodejs-18_x
    pkgs.nodePackages.typescript-language-server
	];
}