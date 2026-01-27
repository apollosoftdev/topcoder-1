# Topcoder GitHub Skills Import CLI

A command-line tool that authenticates with GitHub, performs deep analysis of a user's profile, and recommends verified skills from the Topcoder Standardized Skills API.

## Features

- **GitHub OAuth Device Flow** - Secure authentication without exposing credentials
- **Deep Profile Analysis** - Analyzes repositories, commits, pull requests, and starred repos
- **Rate Limit Handling** - Gracefully handles GitHub API rate limits with automatic retry
- **Topcoder Skills Matching** - Maps detected technologies to official Topcoder skills via API
- **Confidence Scoring** - Multi-factor scoring algorithm (0-100) based on activity evidence
- **Evidence Links** - Provides links to repos, commits, and PRs as verification proof
- **Resume Support** - Can resume interrupted scans from saved progress
- **Configurable** - All scoring weights and thresholds are externalized to JSON config

## Installation

### Prerequisites

- Node.js 18+
- npm or yarn
- GitHub OAuth App credentials (see Configuration)

### Setup

```bash
# Clone the repository
git clone https://github.com/apollosoftdev/topcoder-1.git
cd topcoder-1

# Install dependencies
npm install

# Build (optional, for production)
npm run build
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
GITHUB_CLIENT_ID=your_github_oauth_app_client_id
TOPCODER_API_BASE=https://api.topcoder.com/v5
```

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_CLIENT_ID` | Yes | GitHub OAuth App Client ID |
| `GITHUB_DEVICE_CODE_URL` | No | GitHub device code endpoint (default: `https://github.com/login/device/code`) |
| `GITHUB_TOKEN_URL` | No | GitHub token endpoint (default: `https://github.com/login/oauth/access_token`) |
| `TOPCODER_API_BASE` | No | Topcoder API base URL (defaults to dev) |
| `CONSTANTS_PATH` | No | Custom path to constants.json config file |

### Creating a GitHub OAuth App

1. Go to GitHub Settings > Developer Settings > OAuth Apps
2. Click "New OAuth App"
3. Set the callback URL to `http://localhost` (not used for device flow)
4. Copy the Client ID to your `.env` file

### Scoring Configuration

All scoring weights and thresholds are configurable in `config/constants.json`:

```json
{
  "scoring": {
    "weights": {
      "language": 0.40,
      "commits": 0.20,
      "prs": 0.10,
      "projectQuality": 0.10,
      "recency": 0.20
    },
    "baseScore": 15,
    "maxScore": 100,
    "minScoreThreshold": 15
  }
}
```

## Usage

### Basic Usage

```bash
# Run the CLI
npm start

# Or with ts-node directly
npx ts-node src/index.ts
```

### CLI Options

```bash
tc-skills [options]

Options:
  --max-repos <number>           Maximum repositories to analyze (default: 100)
  --max-commits-per-repo <n>     Maximum commits per repository (default: 200)
  --include-prs <boolean>        Analyze pull requests (default: true)
  --include-stars <boolean>      Include starred repos for interest signals (default: true)
  --output <format>              Output format: text, json (default: text)
  --resume                       Resume from previous interrupted run
  --verbose                      Show detailed progress
  -h, --help                     Display help
```

### Commands

```bash
# Main analysis (default)
npm start

# Check authentication and cache status
npm start -- status

# Clear all cached data
npm start -- clear-cache

# JSON output for programmatic use
npm start -- --output json

# Verbose mode with detailed progress
npm start -- --verbose

# Resume interrupted scan
npm start -- --resume
```

### Example Output

```
═══════════════════════════════════════════════════════════
  TOPCODER SKILLS RECOMMENDATIONS
═══════════════════════════════════════════════════════════

Matched Skills:

  TypeScript
  ████████████████░░░░ 78/100
  ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Category: Programming Languages
  Strong TypeScript usage in repositories, active commit history, recent activity
  Evidence:
    https://github.com/user/project1
    https://github.com/user/project2

  React.js
  ██████████████░░░░░░ 65/100
  ID: b2c3d4e5-f6a7-8901-bcde-f12345678901
  Category: Frontend Frameworks
  Moderate React.js experience, quality projects
  Evidence:
    https://github.com/user/react-app

────────────────────────────────────────────────────────────
Run Summary:

  Repositories scanned: 45
  Commits analyzed:     1,234
  Pull requests:        89
  Starred repos:        156
  API calls made:       312
  Total time:           2m 34s
  Skills matched:       12
═══════════════════════════════════════════════════════════
```

## Architecture

### Project Structure

```
src/
├── index.ts              # CLI entry point
├── auth/
│   └── github-oauth.ts   # GitHub Device Flow authentication
├── github/
│   ├── client.ts         # GitHub API client wrapper
│   ├── scraper.ts        # Main scraping orchestrator
│   ├── repos.ts          # Repository data fetching
│   ├── commits.ts        # Commit history analysis
│   ├── pull-requests.ts  # PR analysis
│   └── languages.ts      # Language detection
├── topcoder/
│   ├── skills-api.ts     # Topcoder Skills API client
│   └── skill-matcher.ts  # Technology to skill mapping
├── analysis/
│   ├── scoring.ts        # Multi-factor scoring engine
│   └── evidence.ts       # Evidence collection
├── output/
│   ├── report.ts         # Report generation
│   └── progress.ts       # Progress display
├── utils/
│   ├── cache.ts          # Local caching (tokens, progress)
│   ├── config.ts         # Configuration loader
│   └── rate-limiter.ts   # API rate limit handling
config/
└── constants.json        # Configurable constants
```

### Data Flow

1. **Authentication** - GitHub OAuth Device Flow authenticates the user
2. **Scraping** - Deep scrape of user's GitHub profile:
   - Owned and contributed repositories
   - Commit history with file changes
   - Pull requests (merged, open, closed)
   - Starred repositories (interest signals)
3. **Technology Extraction** - Extracts technologies from:
   - Repository languages (by bytes)
   - Repository topics
   - Commit messages and changed files
   - PR titles and descriptions
4. **Skill Matching** - Maps technologies to Topcoder skills using:
   - Autocomplete API for exact matches
   - Fuzzy match API for similar terms
   - Local alias expansion (js → javascript)
5. **Scoring** - Multi-factor confidence scoring:
   - Language usage (40%) - Code volume and repo coverage
   - Commit activity (20%) - Relevant commits and file changes
   - PR contributions (10%) - Merged PRs mentioning the skill
   - Project quality (10%) - Stars, forks, ownership
   - Recency (20%) - Recent vs historical activity
6. **Evidence Collection** - Links to repos, commits, PRs as proof
7. **Report Generation** - Formatted output with all required fields

## Meeting Requirements

### 1. Authentication / GitHub API

- Implements GitHub OAuth Device Flow for secure authentication
- Tokens are cached locally for subsequent runs
- Rate limits are handled gracefully with exponential backoff
- Supports resume from interrupted scans

### 2. Standardized Skills API

- All skills are fetched from `https://api.topcoder-dev.com/v5/standardized-skills/skills`
- Uses autocomplete and fuzzy match endpoints for accurate matching
- Skills include both ID and name as required
- Technology aliases are configurable in `constants.json`

### 3. Skills Verification

Each recommendation includes:

| Field | Description |
|-------|-------------|
| Skill ID | UUID from Topcoder Standardized Skills API |
| Skill Name | Official skill name from API |
| Score | 0-100 confidence score |
| Explanation | Human-readable reason for the score |
| Evidence | Links to repos, commits, PRs |

### 4. Deep Analysis

The tool performs comprehensive analysis beyond basic repo scraping:

- **Repository Analysis**: Languages by bytes, topics, descriptions
- **Commit Analysis**: Messages, file extensions, frequency
- **PR Analysis**: Titles, bodies, merge status
- **Starred Repos**: Interest signals for emerging skills
- **Recency Weighting**: Recent activity scores higher

### 5. Run Summary

Each run outputs statistics:
- Repositories scanned
- Commits analyzed
- Pull requests inspected
- Starred repos checked
- Total API calls made
- Elapsed time

## Development

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Lint with auto-fix
npm run lint:fix

# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build
```

## Testing

The project includes comprehensive unit tests for core modules:

| Module | Tests | Description |
|--------|-------|-------------|
| `config.test.ts` | 15 | Configuration loading, caching, and helper functions |
| `scoring.test.ts` | 11 | Scoring engine, score bounds, and filtering |
| `evidence.test.ts` | 13 | Evidence collection and formatting |
| `skill-matcher.test.ts` | 13 | Skill matching, term expansion, and aggregation |

Run all tests:
```bash
npm test
```

## License

MIT
