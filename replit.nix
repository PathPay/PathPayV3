{ pkgs }:

{
  deps = [
    pkgs.nodejs-24
    pkgs.nodejs_20
    pkgs.nodePackages.pnpm
    pkgs.psmisc
    pkgs.lsof
    pkgs.iproute2
  ];
}