import { getChannelList } from '@/utils/apiUtils'
import axios from '@/utils/axiosUtils'
import { useQuery } from 'react-query'

// 获取用户所在Channel列表

export default function ChannelHome () {
  const { data, error, isLoading } = useQuery('getChannelList', getChannelList)
  console.log(data?.data)

  return (
    <>
      {data?.data?.map((channel) => {
        return (
          <div key={channel.channelId}>
            {channel.channelRel.name}
          </div>
        )
      })}
    </>
  )
}
