# Port Avalon compute VM helper. Usage (PowerShell, after `gcloud auth login` and `gcloud config set project <id>`):
#   .\scripts\cloud\vm.ps1 create      # creates the Spot VM (billed while it runs)
#   .\scripts\cloud\vm.ps1 sync        # sends the current v1 branch to the VM and installs dependencies
#   .\scripts\cloud\vm.ps1 ssh         # opens a shell on the VM
#   .\scripts\cloud\vm.ps1 stop        # stops it (disk kept, compute billing stops)
#   .\scripts\cloud\vm.ps1 delete      # deletes it
param([Parameter(Mandatory)][ValidateSet('create','sync','ssh','stop','start','delete')] [string]$Cmd, [switch]$OnDemand)
$Name = 'tg-compute'; $Zone = 'europe-west1-b'; $Type = 'c2d-highcpu-56'
$Root = Resolve-Path "$PSScriptRoot\..\.."
switch ($Cmd) {
  'create' {
    # Spot needs preemptible CPU quota; -OnDemand skips it (new projects often have 0 Spot quota).
    $Pricing = if ($OnDemand) { @() } else { @('--provisioning-model', 'SPOT', '--instance-termination-action', 'STOP') }
    gcloud compute instances create $Name --zone $Zone --machine-type $Type @Pricing `
      --image-family ubuntu-2404-lts-amd64 --image-project ubuntu-os-cloud `
      --boot-disk-size 100GB --boot-disk-type pd-balanced `
      --metadata-from-file startup-script="$PSScriptRoot\startup.sh"
  }
  'sync' {
    $Bundle = Join-Path $env:TEMP 'tg-v1.bundle'
    git -C $Root bundle create $Bundle v1
    # scp does not expand ~ on Windows (pscp), so the destination is home-relative
    gcloud compute scp $Bundle "${Name}:tg-v1.bundle" --zone $Zone
    if ($LASTEXITCODE -ne 0) { throw 'bundle copy failed' }
    # one line, fail-fast: a multi-line here-string through plink ran npm ci in ~ and still reported success
    $Remote = 'set -e; until [ -f /opt/tg-ready ]; do echo waiting for setup; sleep 10; done; if [ -d ~/tg ]; then cd ~/tg && git fetch ~/tg-v1.bundle v1:v1 --update-head-ok && git checkout -f v1; else git clone -b v1 ~/tg-v1.bundle ~/tg && cd ~/tg; fi; npm ci && npx playwright install chromium && npx next typegen; echo synced: $(git log --oneline -1)'
    gcloud compute ssh $Name --zone $Zone --strict-host-key-checking=no --command $Remote
    if ($LASTEXITCODE -ne 0) { throw 'remote sync failed' }
  }
  'ssh'    { gcloud compute ssh $Name --zone $Zone }
  'stop'   { gcloud compute instances stop $Name --zone $Zone }
  'start'  { gcloud compute instances start $Name --zone $Zone }
  'delete' { gcloud compute instances delete $Name --zone $Zone }
}
