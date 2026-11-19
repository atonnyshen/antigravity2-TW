#!/usr/bin/env ruby
# Native atomic swap, available on macOS and Linux. The displaced app.asar
# stays at the candidate path, so a concurrent official update is recoverable.
# No compilation, shell interpolation, or external Ruby gems are required.
require 'fiddle'

candidate, live = ARGV
abort('Expected candidate and live ASAR paths') unless candidate && live

handle = Fiddle::Handle::DEFAULT
if RUBY_PLATFORM.include?('darwin')
  swap = Fiddle::Function.new(handle['renamex_np'],
                              [Fiddle::TYPE_VOIDP, Fiddle::TYPE_VOIDP, Fiddle::TYPE_INT],
                              Fiddle::TYPE_INT)
  result = swap.call(candidate + "\0", live + "\0", 0x00000002) # RENAME_SWAP
elsif RUBY_PLATFORM.include?('linux')
  swap = Fiddle::Function.new(handle['renameat2'],
                              [Fiddle::TYPE_INT, Fiddle::TYPE_VOIDP,
                               Fiddle::TYPE_INT, Fiddle::TYPE_VOIDP,
                               Fiddle::TYPE_INT], Fiddle::TYPE_INT)
  result = swap.call(-100, candidate + "\0", -100, live + "\0", 0x00000002) # RENAME_EXCHANGE
else
  abort('Atomic ASAR exchange is unavailable on this operating system')
end

if result != 0
  abort("Atomic ASAR exchange failed (errno #{Fiddle.last_error})")
end
