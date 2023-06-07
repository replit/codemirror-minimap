{ pkgs }: {
	deps = [
    pkgs.nodePackages.pnpm
		pkgs.nodejs-16_x
    pkgs.nodePackages.typescript-language-server
	];
}