const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')

function usage() {
  console.error(
    'Usage: node scripts/export-example.js <source-dir> <target-dir>'
  )
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function parseCatalogVersions(workspaceYamlPath) {
  const yaml = fs.readFileSync(workspaceYamlPath, 'utf8').split(/\r?\n/)
  const catalog = {}
  let inCatalog = false

  for (const line of yaml) {
    if (!inCatalog) {
      if (line.trim() === 'catalog:') {
        inCatalog = true
      }
      continue
    }

    if (!line.trim()) {
      continue
    }

    if (!line.startsWith('    ')) {
      break
    }

    const match = line.match(/^\s{4}(.+?):\s*(.+)$/)
    if (!match) {
      continue
    }

    const dependencyName = stripQuotes(match[1].trim())
    const version = stripQuotes(match[2].trim())
    catalog[dependencyName] = version
  }

  return catalog
}

function collectWorkspaceVersions(directory, versions = {}) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
      continue
    }

    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      collectWorkspaceVersions(entryPath, versions)
      continue
    }

    if (entry.name !== 'package.json') {
      continue
    }

    const packageJson = JSON.parse(fs.readFileSync(entryPath, 'utf8'))
    if (packageJson.name && packageJson.version) {
      versions[packageJson.name] = packageJson.version
    }
  }

  return versions
}

function copyExample(sourceDir, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    filter: (filePath) => {
      const relativePath = path.relative(sourceDir, filePath)
      if (!relativePath) {
        return true
      }

      const segments = relativePath.split(path.sep)
      return !segments.some((segment) =>
        ['node_modules', '.next', '.turbo', 'out'].includes(segment)
      )
    },
  })
}

function resolveDependencyBlock(block, workspaceVersions, catalogVersions) {
  if (!block || typeof block !== 'object') {
    return
  }

  for (const [dependencyName, version] of Object.entries(block)) {
    if (version === 'workspace:*') {
      const resolvedVersion = workspaceVersions[dependencyName]
      if (!resolvedVersion) {
        throw new Error(
          `Unable to resolve workspace version for ${dependencyName}`
        )
      }

      block[dependencyName] = resolvedVersion
      continue
    }

    if (version === 'catalog:') {
      const resolvedVersion = catalogVersions[dependencyName]
      if (!resolvedVersion) {
        throw new Error(`Unable to resolve catalog version for ${dependencyName}`)
      }

      block[dependencyName] = resolvedVersion
    }
  }
}

function rewritePackageJson(packageJsonPath, workspaceVersions, catalogVersions) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

  resolveDependencyBlock(packageJson.dependencies, workspaceVersions, catalogVersions)
  resolveDependencyBlock(packageJson.devDependencies, workspaceVersions, catalogVersions)
  resolveDependencyBlock(packageJson.peerDependencies, workspaceVersions, catalogVersions)
  resolveDependencyBlock(
    packageJson.optionalDependencies,
    workspaceVersions,
    catalogVersions
  )

  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

function main() {
  const [, , sourceArg, targetArg] = process.argv
  const sourceInput = sourceArg || 'examples/next/tina-self-hosted-demo'
  const targetInput = targetArg || 'exported/tina-self-hosted-demo'

  if (!sourceArg || !targetArg) {
    console.log(
      `No args provided. Using defaults: ${sourceInput} -> ${targetInput}`
    )
  }

  const sourceDir = path.resolve(repoRoot, sourceInput)
  const targetDir = path.resolve(repoRoot, targetInput)

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Source example does not exist: ${sourceDir}`)
  }

  const workspaceVersions = collectWorkspaceVersions(path.join(repoRoot, 'packages'))
  const catalogVersions = parseCatalogVersions(
    path.join(repoRoot, 'pnpm-workspace.yaml')
  )

  copyExample(sourceDir, targetDir)
  rewritePackageJson(
    path.join(targetDir, 'package.json'),
    workspaceVersions,
    catalogVersions
  )

  console.log(`Exported ${sourceInput} to ${path.relative(repoRoot, targetDir)}`)
}

main()