export const getTokenHourlyDetailsQuery = (tokenAddress: string) => `{
    tokenHourDatas(
      first: 1
      orderBy: periodStartUnix
      orderDirection: desc
      where: {token: "${tokenAddress}"}
    ) {
      id
      priceUSD
      feesUSD
      periodStartUnix
      totalValueLocked
      totalValueLockedUSD
      token {
        decimals
      }
    }
  }`;

export const getTokenHourlyDetailsQueryAtTimeStamp = (tokenAddress: string, timeStamp: number) => `{
    tokenHourDatas(
      first: 1
      orderBy: periodStartUnix
      orderDirection: desc
      where: {token: "${tokenAddress}", periodStartUnix_lte: ${timeStamp}}
    ) {
      id
      feesUSD
      priceUSD
      totalValueLocked
      totalValueLockedUSD
      periodStartUnix
      token {
        decimals
      }
    }
  }`;

export const getTokenDayDataPerHour = (tokenAddress: string, timeStamp: number) => `{
  tokenHourDatas(
    first: 24
    orderBy: periodStartUnix
    orderDirection: desc
    where: {token: "${tokenAddress}", periodStartUnix_lte: ${timeStamp}}
  ) {
    id
    feesUSD
    priceUSD
    totalValueLocked
    totalValueLockedUSD
    periodStartUnix
    token {
      decimals
    }
  }
}`
