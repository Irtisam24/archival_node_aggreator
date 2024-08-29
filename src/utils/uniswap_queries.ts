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
      token {
        decimals
      }
    }
  }`;
