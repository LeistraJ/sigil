require "language/node"

class SigilCli < Formula
  desc "Local-first project memory and governance engine for AI-assisted development"
  homepage "https://github.com/LeistraJ/sigil"
  url "https://registry.npmjs.org/@leistraj/sigil/-/sigil-0.1.7.tgz"
  sha256 "0775dd26064021316db71ddb66ab56b0810914a3b7f90f736aa320e45a60cde2"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "0.", shell_output("#{bin}/sigil --version")
    assert_match "Sigil not initialized", shell_output("#{bin}/sigil status 2>&1", 1)
  end
end
